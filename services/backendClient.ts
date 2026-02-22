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
const WEB_BACKEND_BASE_URL = (import.meta.env.VITE_BACKEND_URL || 'http://47.93.151.131:10723').replace(/\/$/, '');

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
}

export const fetchSessionState = (chapterId: string): Promise<SessionStateResult> => {
  return backendClient.get<SessionStateResult>(`/v1/chapters/${encodeURIComponent(chapterId)}/session-state`);
};

export async function getWorkspaceUploadUrl(params: {
  chapterId: string;
  filename: string;
  fileSizeBytes: number;
}): Promise<{ presigned_url: string; oss_key: string }> {
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
