import { User } from '../types';
import { backendClient } from './backendClient';

interface BackendAuthUser {
  id: string;
  email: string;
  display_name: string;
}

interface AuthResponse {
  user: BackendAuthUser;
  access_token: string;
  access_token_expires_in: number;
  refresh_token: string;
}

interface RefreshResponse {
  access_token: string;
  access_token_expires_in: number;
}

interface MeResponse {
  id: string;
  email: string;
  display_name: string;
}

const WEB_AUTH_STORAGE_KEY = 'tutor.web.auth.v1';

const createWebDeviceId = () => `web-${Math.random().toString(36).slice(2, 12)}`;

const loadWebAuthState = () => {
  const fallback = {
    deviceId: createWebDeviceId(),
    accessToken: '',
    refreshToken: '',
    accessTokenExpiresAt: 0,
  };
  try {
    const raw = window.localStorage.getItem(WEB_AUTH_STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(WEB_AUTH_STORAGE_KEY, JSON.stringify(fallback));
      return fallback;
    }
    const parsed = JSON.parse(raw);
    return {
      ...fallback,
      ...parsed,
      deviceId: String(parsed?.deviceId || fallback.deviceId),
      accessToken: String(parsed?.accessToken || ''),
      refreshToken: String(parsed?.refreshToken || ''),
      accessTokenExpiresAt: Number(parsed?.accessTokenExpiresAt || 0),
    };
  } catch {
    return fallback;
  }
};

const saveWebAuthState = (patch: Partial<{
  deviceId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
}>) => {
  const current = loadWebAuthState();
  const next = { ...current, ...(patch || {}) };
  window.localStorage.setItem(WEB_AUTH_STORAGE_KEY, JSON.stringify(next));
  return next;
};

const clearWebAuthState = () => {
  const next = {
    deviceId: createWebDeviceId(),
    accessToken: '',
    refreshToken: '',
    accessTokenExpiresAt: 0,
  };
  window.localStorage.setItem(WEB_AUTH_STORAGE_KEY, JSON.stringify(next));
  return next;
};

const mapUser = (user: BackendAuthUser | MeResponse): User => ({
  id: user.id,
  email: user.email,
  name: user.display_name,
});

const getAuthState = async () => {
  if (!window.tutorApp) {
    return loadWebAuthState();
  }
  return window.tutorApp.getAuth();
};

const setAuthState = async (patch: Partial<{
  deviceId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
}>) => {
  if (!window.tutorApp) {
    return saveWebAuthState(patch);
  }
  return window.tutorApp.setAuth(patch);
};

const getRememberLogin = async () => {
  if (!window.tutorApp) {
    return true;
  }
  try {
    const settings = await window.tutorApp.getSettings();
    return settings.rememberLogin !== false;
  } catch {
    return true;
  }
};

const storeTokens = async (payload: {
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds: number;
}) => {
  const rememberLogin = await getRememberLogin();
  const currentAuth = await getAuthState();
  const nextRefreshToken = rememberLogin ? (payload.refreshToken ?? currentAuth.refreshToken) : '';
  const expiresAt = Date.now() + Math.max(0, payload.expiresInSeconds - 10) * 1000;
  await setAuthState({
    accessToken: payload.accessToken,
    refreshToken: nextRefreshToken,
    accessTokenExpiresAt: expiresAt,
  });
};

export const authService = {
  async requestEmailCode(email: string) {
    return backendClient.post<{ sent: boolean; expires_in_seconds: number; dev_code?: string }>(
      '/v1/auth/request-email-code',
      { email, purpose: 'register' },
      false
    );
  },

  async register(input: { email: string; verificationCode: string; password: string; displayName: string }) {
    const auth = await getAuthState();
    const response = await backendClient.post<AuthResponse>(
      '/v1/auth/register',
      {
        email: input.email,
        verification_code: input.verificationCode,
        password: input.password,
        display_name: input.displayName,
        device_id: auth.deviceId,
      },
      false
    );

    await storeTokens({
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresInSeconds: response.access_token_expires_in,
    });

    return mapUser(response.user);
  },

  async login(input: { email: string; password: string }) {
    const auth = await getAuthState();
    const response = await backendClient.post<AuthResponse>(
      '/v1/auth/login',
      {
        email: input.email,
        password: input.password,
        device_id: auth.deviceId,
      },
      false
    );

    await storeTokens({
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresInSeconds: response.access_token_expires_in,
    });

    return mapUser(response.user);
  },

  async refresh() {
    const auth = await getAuthState();
    if (!auth.refreshToken) {
      return null;
    }

    const response = await backendClient.post<RefreshResponse>(
      '/v1/auth/refresh',
      {
        refresh_token: auth.refreshToken,
        device_id: auth.deviceId,
      },
      false
    );

    await storeTokens({
      accessToken: response.access_token,
      expiresInSeconds: response.access_token_expires_in,
    });

    return response;
  },

  async me() {
    const response = await backendClient.get<MeResponse>('/v1/me', true);
    return mapUser(response);
  },

  async restoreUserSession(): Promise<User | null> {
    const rememberLogin = await getRememberLogin();
    if (!rememberLogin) {
      if (window.tutorApp) {
        await window.tutorApp.clearAuth();
      } else {
        clearWebAuthState();
      }
      return null;
    }

    const auth = await getAuthState();
    if (!auth.refreshToken) {
      return null;
    }

    try {
      if (!auth.accessToken || Date.now() >= auth.accessTokenExpiresAt) {
        await this.refresh();
      }
      return await this.me();
    } catch {
      if (window.tutorApp) {
        await window.tutorApp.clearAuth();
      } else {
        clearWebAuthState();
      }
      return null;
    }
  },

  async logout() {
    const auth = await getAuthState();
    try {
      if (auth.refreshToken) {
        await backendClient.post('/v1/auth/logout', { refresh_token: auth.refreshToken }, false);
      }
    } finally {
      if (window.tutorApp) {
        await window.tutorApp.clearAuth();
      } else {
        clearWebAuthState();
      }
    }
  },
};
