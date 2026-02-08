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

export const backendClient = {
  request: async <T>(method: string, path: string, body?: any, withAuth = true): Promise<T> => {
    if (!window.tutorApp) {
      throw new Error('tutorApp API unavailable');
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
