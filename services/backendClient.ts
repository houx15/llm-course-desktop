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
const WEB_BACKEND_BASE_URL = ((import.meta as any)?.env?.VITE_BACKEND_URL || 'http://47.93.151.131:10723').replace(/\/$/, '');

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
