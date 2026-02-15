
export type BlockType = 'markdown' | 'code' | 'html';

export interface ContentBlock {
  id: string;
  type: BlockType;
  content: string;
  output?: string;
}

export type CompletionStatus = 'LOCKED' | 'IN_PROGRESS' | 'COMPLETED';

export interface Checkpoint {
  id: string;
  title: string;
  status: CompletionStatus;
  description?: string; // e.g., "load_csv"
  subItems?: Checkpoint[]; // Nested steps for this checkpoint
}

export interface RoadmapSection {
  title: string; // e.g., "Future Tasks"
  items: Checkpoint[];
}

export interface Resource {
  title: string;
  type: 'ppt' | 'code' | 'pdf' | 'link';
  url: string;
}

export interface Lesson {
  id: string;
  title: string;
}

export interface Chapter {
  id: string;
  title: string;
  description?: string;
  status: CompletionStatus;
  initialMessage: string; // The first message sent by AI
  roadmap: {
    currentTask: string;
    nextAdvice: string;
    sections: RoadmapSection[]; // "My Progress", "Future Tasks"
    statusSummary: {
      round: number;
      learnerState: string;
    }
  };
  resources: Resource[];
  lessons: Lesson[];
  colabLink?: string;
}

export interface Phase {
  id: string;
  title: string;
  status: CompletionStatus;
  chapters: Chapter[];
  overview: {
    experience: string;
    gains: string;
    necessity: string;
    journey: string;
  };
}

export interface Message {
  role: 'user' | 'model';
  text: string;
  attachments?: string[];
  context?: string;
}

export interface CodeWorkspaceFile {
  name: string;
  size: number;
  modified: number;
}

export interface CodeExecutionOutputEvent {
  chapterId: string;
  stream: 'stdout' | 'stderr';
  data: string;
}

export interface CodeExecutionExitEvent {
  chapterId: string;
  exitCode: number;
  signal?: string | null;
  timedOut?: boolean;
  killed?: boolean;
}

export interface CourseSummary {
  id: string;
  title: string;
  code: string;
  instructor: string;
  semester: string;
  description: string;
  joinedAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
}

declare global {
  interface Window {
    tutorApp?: {
      getVersion: () => Promise<string>;
      openExternal: (url: string) => Promise<boolean>;
      getSettings: () => Promise<{
        storageRoot: string;
        backendBaseUrl: string;
        sidecarBaseUrl: string;
        rememberLogin: boolean;
        rememberKeys: Record<string, boolean>;
        modelConfigs: Record<string, { model: string }>;
        activeProvider: string;
      }>;
      setSettings: (patch: Partial<{
        storageRoot: string;
        backendBaseUrl: string;
        sidecarBaseUrl: string;
        rememberLogin: boolean;
        rememberKeys: Record<string, boolean>;
        modelConfigs: Record<string, { model: string }>;
        activeProvider: string;
      }>) => Promise<any>;
      chooseStorageRoot: () => Promise<{ canceled: boolean; path?: string; settings?: any }>;
      getAuth: () => Promise<{
        deviceId: string;
        accessToken: string;
        refreshToken: string;
        accessTokenExpiresAt: number;
      }>;
      setAuth: (patch: Partial<{
        deviceId: string;
        accessToken: string;
        refreshToken: string;
        accessTokenExpiresAt: number;
      }>) => Promise<any>;
      clearAuth: () => Promise<any>;
      saveLlmKey: (provider: string, key: string) => Promise<{ saved: boolean }>;
      getLlmKey: (provider: string) => Promise<{ key: string }>;
      deleteLlmKey: (provider: string) => Promise<{ deleted: boolean }>;
      backendRequest: (payload: {
        method?: string;
        path: string;
        body?: any;
        headers?: Record<string, string>;
        withAuth?: boolean;
      }) => Promise<{
        ok: boolean;
        status: number;
        data: any;
      }>;
      enqueueSync: (payload: { queue: string; payload: any }) => Promise<{ queued: boolean; size: number }>;
      flushSync: (payload: { queue: string; endpoint: string; maxRetries?: number }) => Promise<{
        queue: string;
        sent: number;
        remaining: number;
        deferred?: number;
        deadLettered?: number;
      }>;
      checkAppUpdates: (payload: {
        desktop_version: string;
        sidecar_version: string;
        installed: Record<string, string>;
      }) => Promise<{
        ok: boolean;
        status: number;
        data: any;
      }>;
      checkChapterUpdates: (payload: {
        course_id: string;
        chapter_id: string;
        installed: {
          chapter_bundle?: string | null;
          experts: Record<string, string>;
        };
      }) => Promise<{
        ok: boolean;
        status: number;
        data: any;
      }>;
      installBundle: (bundle: {
        type: 'curriculum' | 'agents' | 'experts';
        id: string;
        version: string;
        srcUrl: string;
      }) => Promise<{ installedPath: string }>;
      installBundleRelease: (release: {
        bundle_type: string;
        scope_id: string;
        version: string;
        artifact_url: string;
        sha256?: string;
        size_bytes?: number;
        mandatory?: boolean;
      }) => Promise<{ installedPath: string; bundleType: string; scopeId: string; version: string }>;
      listBundles: (type: 'curriculum' | 'agents' | 'experts') => Promise<string[]>;
      getBundleIndex: () => Promise<any>;
      listCurriculumChapters: () => Promise<Array<{ courseId: string; chapterId: string; title: string }>>;
      getCurriculumChapterContent: (payload: { courseId: string; chapterId: string }) => Promise<{
        chapter_context: string;
        task_list: string;
        task_completion_principles: string;
        interaction_protocol?: string;
        socratic_vs_direct?: string;
      }>;
      startRuntime: (config: {
        pythonPath?: string;
        llmProvider: 'anthropic' | 'openai' | 'custom';
        llmApiKey: string;
        llmModel?: string;
        llmBaseUrl?: string;
      }) => Promise<{
        started: boolean;
        pid?: number;
        reason?: string;
        stderr?: string;
        runtime_source?: string;
        python_source?: string;
        contract_version?: string;
        contract_status?: number;
      }>;
      stopRuntime: () => Promise<{ stopped: boolean }>;
      runtimeHealth: () => Promise<{ healthy: boolean; status?: number; data?: any; error?: string; stderr?: string; runtime?: any }>;
      runtimePreflight: () => Promise<{
        ok: boolean;
        phase?: 'health' | 'contract' | 'ready';
        reason?: string;
        status?: number;
        contract_version?: string;
        contract?: any;
        stderr?: string;
        runtime?: any;
      }>;
      createRuntimeSession: (payload: { chapterId: string }) => Promise<{ session_id: string; initial_message?: string }>;
      createCodeFile: (payload: { chapterId: string; filename: string; content: string }) => Promise<{ filePath: string }>;
      openCodePath: (filePath: string) => Promise<{ opened: boolean }>;
      readCodeFile: (payload: { chapterId: string; filename: string }) => Promise<{ content: string; filePath: string }>;
      writeCodeFile: (payload: { chapterId: string; filename: string; content: string }) => Promise<{ filePath: string; bytes: number }>;
      listCodeFiles: (payload: { chapterId: string }) => Promise<{ files: CodeWorkspaceFile[] }>;
      executeCode: (payload: {
        chapterId: string;
        code: string;
        filename?: string;
        env?: Record<string, string>;
        timeoutMs?: number;
      }) => Promise<{ started: boolean; pythonPath: string; timeoutMs: number; chapterId: string }>;
      killCodeExecution: (payload: { chapterId: string }) => Promise<{ killed: boolean; chapterId: string }>;
      onCodeOutput: (callback: (payload: CodeExecutionOutputEvent) => void) => () => void;
      onCodeExit: (callback: (payload: CodeExecutionExitEvent) => void) => () => void;
    };
  }
}
