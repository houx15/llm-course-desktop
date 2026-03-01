export interface BundleDescriptor {
  bundle_type: string;
  scope_id: string;
  version: string;
  artifact_url: string;
  sha256: string;
  size_bytes: number;
  mandatory: boolean;
}

interface CheckAppResponse {
  required: BundleDescriptor[];
  optional: BundleDescriptor[];
}

interface CheckChapterResponse {
  required: BundleDescriptor[];
  resolved_chapter: {
    course_id: string;
    chapter_id: string;
    required_experts: string[];
  };
}

const asError = (result: { status: number; data: any }) => {
  const message = result?.data?.error?.message || result?.data?.detail || `Request failed (${result.status})`;
  return new Error(message);
};

const getInstalledVersionsForApp = (indexData: any): Record<string, string> => {
  const pythonRuntimeEntries = Object.entries(indexData?.python_runtime || {}).filter(
    ([, entry]) => (entry as any)?.version
  );
  const pythonRuntimeVersion = pythonRuntimeEntries.length > 0
    ? String((pythonRuntimeEntries[0][1] as any).version)
    : '';

  const installed: Record<string, string> = {
    app_agents: indexData?.app_agents?.core?.version || '',
    experts_shared: indexData?.experts_shared?.shared?.version || '',
    python_runtime: pythonRuntimeVersion,
  };

  // Include individual expert bundle versions
  const expertsMap = indexData?.experts || {};
  Object.entries(expertsMap).forEach(([expertId, info]) => {
    const value = info as { version?: string };
    if (value?.version) {
      installed[`experts:${expertId}`] = value.version;
    }
  });

  return installed;
};

const getInstalledVersionsForChapter = (indexData: any, _courseId: string, chapterUuid: string) => {
  const expertsMap = indexData?.experts || {};
  const installedExperts: Record<string, string> = {};

  Object.entries(expertsMap).forEach(([expertId, info]) => {
    const value = info as { version?: string };
    if (value?.version) {
      installedExperts[expertId] = value.version;
    }
  });

  return {
    // chapterUuid is now the chapter UUID, matching indexData.chapter[uuid]
    chapter_bundle: indexData?.chapter?.[chapterUuid]?.version || null,
    experts: installedExperts,
  };
};

const installReleases = async (releases: BundleDescriptor[]) => {
  if (!window.tutorApp) {
    throw new Error('tutorApp API unavailable');
  }

  for (const release of releases) {
    try {
      await window.tutorApp.installBundleRelease(release);
    } catch (err) {
      // Log per-bundle failures but continue — one bad URL shouldn't block the rest
      console.warn(`Bundle install failed (${release.bundle_type}/${release.scope_id}):`, err);
    }
  }
};

export const updateManager = {
  async checkAppUpdates(installed: Record<string, string>): Promise<CheckAppResponse> {
    if (!window.tutorApp) {
      throw new Error('tutorApp API unavailable');
    }

    const result = await window.tutorApp.checkAppUpdates({
      desktop_version: '0.1.0',
      sidecar_version: '0.1.0',
      installed,
    });

    if (!result.ok) {
      throw asError(result);
    }

    return result.data as CheckAppResponse;
  },

  async checkChapterUpdates(courseId: string, chapterId: string, installed: { chapter_bundle?: string | null; experts: Record<string, string> }) {
    if (!window.tutorApp) {
      throw new Error('tutorApp API unavailable');
    }

    const result = await window.tutorApp.checkChapterUpdates({
      course_id: courseId,
      chapter_id: chapterId,
      installed,
    });

    if (!result.ok) {
      throw asError(result);
    }

    return result.data as CheckChapterResponse;
  },

  async syncAppBundles() {
    if (!window.tutorApp) {
      return { installed: 0 };
    }

    const indexData = await window.tutorApp.getBundleIndex();
    const installed = getInstalledVersionsForApp(indexData);
    const check = await this.checkAppUpdates(installed);
    // Exclude python_runtime — it goes through the dedicated sidecar:ensureReady
    // flow which has its own progress UI.
    const releases = [...check.required, ...check.optional].filter(
      (r) => r.bundle_type !== 'python_runtime'
    );
    await installReleases(releases);
    return { installed: releases.length, check };
  },

  async checkSidecarUpdates(): Promise<BundleDescriptor | null> {
    if (!window.tutorApp) {
      throw new Error('tutorApp API unavailable');
    }

    const indexData = await window.tutorApp.getBundleIndex();
    const installed = getInstalledVersionsForApp(indexData);
    const check = await this.checkAppUpdates(installed);
    const allReleases = [...check.required, ...check.optional];
    return allReleases.find((r) => r.bundle_type === 'python_runtime') || null;
  },

  async syncSidecarBundle(): Promise<{ installed: boolean; descriptor: BundleDescriptor | null }> {
    if (!window.tutorApp) {
      return { installed: false, descriptor: null };
    }

    const descriptor = await this.checkSidecarUpdates();
    if (!descriptor) {
      return { installed: false, descriptor: null };
    }

    await window.tutorApp.installBundleRelease(descriptor);
    return { installed: true, descriptor };
  },

  async syncChapterBundles(courseId: string, chapterId: string) {
    if (!window.tutorApp) {
      return { installed: 0 };
    }

    const indexData = await window.tutorApp.getBundleIndex();
    const installed = getInstalledVersionsForChapter(indexData, courseId, chapterId);
    const check = await this.checkChapterUpdates(courseId, chapterId, installed);
    await installReleases(check.required);
    return { installed: check.required.length, check };
  },

  async syncChapterBundlesFromApi(chapters: { id: string; bundle_url: string; bundle_version: string; bundle_sha256: string; bundle_size_bytes: number }[]) {
    if (!window.tutorApp) {
      return { installed: 0 };
    }

    const indexData = await window.tutorApp.getBundleIndex();
    const releases: BundleDescriptor[] = [];

    for (const ch of chapters) {
      if (!ch.bundle_url) continue;
      const installed = indexData?.chapter?.[ch.id];
      if (installed?.version === ch.bundle_version) continue;
      releases.push({
        bundle_type: 'chapter',
        scope_id: ch.id,
        version: ch.bundle_version,
        artifact_url: ch.bundle_url,
        sha256: ch.bundle_sha256 || '',
        size_bytes: ch.bundle_size_bytes || 0,
        mandatory: true,
      });
    }

    await installReleases(releases);
    return { installed: releases.length };
  },
};
