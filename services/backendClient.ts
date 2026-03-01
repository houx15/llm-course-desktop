export class BackendError extends Error {
  status: number;
  code?: string;
  data: any;

  constructor(message: string, status: number, data: any, code?: string) {
    super(message);
    this.name = 'BackendError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

const WEB_AUTH_STORAGE_KEY = 'tutor.web.auth.v1';
// Used only in the web/browser fallback path (non-Electron). In Electron, all
// backend requests go through the IPC bridge in main.mjs, which reads TUTOR_BACKEND_URL.
const WEB_BACKEND_BASE_URL = (import.meta.env.VITE_BACKEND_URL || 'https://api.knoweia.com').replace(/\/$/, '');

const parseErrorMessage = (data: any): { message: string; code?: string } => {
  if (data?.error?.message) {
    return { message: String(data.error.message), code: data.error.code ? String(data.error.code) : undefined };
  }
  if (data?.detail?.message) {
    return { message: String(data.detail.message), code: data.detail.code ? String(data.detail.code) : undefined };
  }
  if (typeof data?.detail === 'string') {
    return { message: data.detail };
  }
  if (typeof data?.message === 'string') {
    return { message: data.message };
  }
  return { message: 'Request failed' };
};

const parseResponseBody = async (response: Response) => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => ({}));
  }
  return response.text().catch(() => '');
};

const getWebAccessToken = () => {
  try {
    const raw = window.localStorage.getItem(WEB_AUTH_STORAGE_KEY);
    if (!raw) {
      return '';
    }
    const parsed = JSON.parse(raw);
    return String(parsed?.accessToken || '');
  } catch {
    return '';
  }
};

export const backendClient = {
  request: async <T>(method: string, path: string, body?: any, withAuth = true): Promise<T> => {
    if (!window.tutorApp) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (withAuth) {
        const accessToken = getWebAccessToken();
        if (accessToken) {
          headers.Authorization = `Bearer ${accessToken}`;
        }
      }

      const response = await fetch(`${WEB_BACKEND_BASE_URL}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await parseResponseBody(response);
      if (!response.ok) {
        const { message, code } = parseErrorMessage(data);
        throw new BackendError(message, response.status, data, code);
      }
      return data as T;
    }

    const response = await window.tutorApp.backendRequest({
      method,
      path,
      body,
      withAuth,
    });

    if (!response.ok) {
      const { message, code } = parseErrorMessage(response.data);
      throw new BackendError(message, response.status, response.data, code);
    }

    return response.data as T;
  },

  get: <T>(path: string, withAuth = true) => {
    return backendClient.request<T>('GET', path, undefined, withAuth);
  },

  post: <T>(path: string, body?: any, withAuth = true) => {
    return backendClient.request<T>('POST', path, body, withAuth);
  },
};

export interface SessionStateResult {
  has_data: boolean;
  session_id?: string;
  turns?: Array<{
    turn_index: number;
    user_message: string;
    companion_response: string;
    turn_outcome: Record<string, unknown>;
    created_at: string;
  }>;
  memory?: Record<string, unknown>;
  report_md?: string;
  agent_state?: Record<string, unknown> | null;
}

export interface SubmittedWorkspaceFile {
  id: number;
  filename: string;
  chapter_id: string;
  oss_key: string;
  file_size_bytes: number;
  submitted_at: string;
  download_url?: string | null;
}

export const fetchSessionState = (chapterId: string, courseId?: string | null): Promise<SessionStateResult> => {
  const query = courseId ? `?course_id=${encodeURIComponent(courseId)}` : '';
  return backendClient.get<SessionStateResult>(
    `/v1/chapters/${encodeURIComponent(chapterId)}/session-state${query}`
  );
};

export interface SessionSummaryResult {
  session_id: string;
  created_at: string;
  last_active_at: string;
  turn_count: number;
  bundle_version?: string;
}

export const fetchChapterSessions = (
  chapterId: string,
  courseId?: string | null,
): Promise<{ sessions: SessionSummaryResult[] }> => {
  const query = courseId ? `?course_id=${encodeURIComponent(courseId)}` : '';
  return backendClient.get<{ sessions: SessionSummaryResult[] }>(
    `/v1/chapters/${encodeURIComponent(chapterId)}/sessions${query}`
  );
};

export const fetchSessionStateById = (
  sessionId: string,
): Promise<SessionStateResult> => {
  return backendClient.get<SessionStateResult>(
    `/v1/sessions/${encodeURIComponent(sessionId)}/state`
  );
};

export async function getWorkspaceUploadUrl(params: {
  chapterId: string;
  filename: string;
  fileSizeBytes: number;
}): Promise<{ presigned_url: string; oss_key: string; required_headers?: Record<string, string> }> {
  return backendClient.post('/v1/storage/workspace/upload-url', {
    chapter_id: params.chapterId,
    filename: params.filename,
    file_size_bytes: params.fileSizeBytes,
  });
}

export async function confirmWorkspaceUpload(params: {
  ossKey: string;
  filename: string;
  chapterId: string;
  fileSizeBytes: number;
}): Promise<{ quota_used_bytes: number; quota_limit_bytes: number }> {
  return backendClient.post('/v1/storage/workspace/confirm', {
    oss_key: params.ossKey,
    filename: params.filename,
    chapter_id: params.chapterId,
    file_size_bytes: params.fileSizeBytes,
  });
}

export async function uploadWorkspaceToPresignedUrl(params: {
  presignedUrl: string;
  content: string;
  contentType?: string;
  headers?: Record<string, string>;
}): Promise<void> {
  const url = String(params.presignedUrl || '').trim();
  if (!url) {
    throw new Error('Missing upload URL');
  }

  // Backend returns this sentinel when OSS is disabled.
  if (url.includes('/dev-no-oss')) {
    throw new Error('后端未启用对象存储，请联系管理员配置 OSS');
  }

  if (window.tutorApp) {
    const headers: Record<string, string> = { ...(params.headers || {}) };
    if (params.contentType && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = params.contentType;
    }
    const response = await window.tutorApp.backendRequest({
      method: 'PUT',
      path: url,
      withAuth: false,
      rawBody: true,
      headers,
      body: params.content,
    });
    if (!response.ok) {
      const status = Number(response.status || 0);
      const detail =
        typeof response.data === 'string'
          ? response.data.slice(0, 240)
          : JSON.stringify(response.data || {}).slice(0, 240);
      throw new Error(`OSS upload failed (${status || 'network'}): ${detail || 'no detail'}`);
    }
    return;
  }

  const webHeaders: Record<string, string> = {};
  Object.assign(webHeaders, params.headers || {});
  if (params.contentType && !Object.keys(webHeaders).some((k) => k.toLowerCase() === 'content-type')) {
    webHeaders['Content-Type'] = params.contentType;
  }
  const response = await fetch(url, {
    method: 'PUT',
    headers: webHeaders,
    body: params.content,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OSS upload failed (${response.status}): ${detail.slice(0, 240) || 'no detail'}`);
  }
}

export async function listWorkspaceSubmittedFiles(): Promise<{
  files: SubmittedWorkspaceFile[];
  quota_used_bytes: number;
  quota_limit_bytes: number;
}> {
  return backendClient.get('/v1/storage/workspace/files');
}

export interface ChapterCloudFile {
  filename: string;
  oss_key: string;
  file_size_bytes: number;
  updated_at: string;
  download_url?: string | null;
}

export async function listChapterCloudFiles(chapterId: string): Promise<{
  files: ChapterCloudFile[];
}> {
  return backendClient.get(`/v1/storage/workspace/chapter-files/${encodeURIComponent(chapterId)}`);
}

export async function deleteChapterCloudFile(chapterId: string, filename: string): Promise<{ deleted: boolean }> {
  return backendClient.request<{ deleted: boolean }>(
    'DELETE',
    `/v1/storage/workspace/chapter-files/${encodeURIComponent(chapterId)}/${encodeURIComponent(filename)}`
  );
}

// ── Bug report upload ──────────────────────────────────────────────────────

export async function getBugReportUrl(params: {
  fileSizeBytes: number;
}): Promise<{ bug_id: string; presigned_url: string; oss_key: string; required_headers?: Record<string, string> }> {
  return backendClient.post('/v1/bugs/report-url', {
    file_size_bytes: params.fileSizeBytes,
  });
}

export async function confirmBugReport(params: {
  bugId: string;
  ossKey: string;
  fileSizeBytes: number;
  appVersion?: string;
  platform?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ bug_id: string }> {
  return backendClient.post('/v1/bugs/confirm', {
    bug_id: params.bugId,
    oss_key: params.ossKey,
    file_size_bytes: params.fileSizeBytes,
    app_version: params.appVersion || '',
    platform: params.platform || '',
    description: params.description || '',
    metadata: params.metadata || {},
  });
}

export async function downloadFromUrl(url: string): Promise<string> {
  if (!url) throw new Error('Missing download URL');

  if (window.tutorApp) {
    const response = await window.tutorApp.backendRequest({
      method: 'GET',
      path: url,
      withAuth: false,
    });
    if (!response.ok) {
      throw new Error(`Download failed (${response.status})`);
    }
    return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  }

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download failed (${resp.status})`);
  return resp.text();
}
