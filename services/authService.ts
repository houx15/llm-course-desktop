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

const mapUser = (user: BackendAuthUser | MeResponse): User => ({
  id: user.id,
  email: user.email,
  name: user.display_name,
});

const getAuthState = async () => {
  if (!window.tutorApp) {
    throw new Error('tutorApp API unavailable');
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
    throw new Error('tutorApp API unavailable');
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
  async requestEmailCode(email: string, purpose: 'register' | 'login') {
    return backendClient.post<{ sent: boolean; expires_in_seconds: number; dev_code?: string }>(
      '/v1/auth/request-email-code',
      { email, purpose },
      false
    );
  },

  async register(input: { email: string; verificationCode: string; displayName: string }) {
    const auth = await getAuthState();
    const response = await backendClient.post<AuthResponse>(
      '/v1/auth/register',
      {
        email: input.email,
        verification_code: input.verificationCode,
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

  async login(input: { email: string; verificationCode: string }) {
    const auth = await getAuthState();
    const response = await backendClient.post<AuthResponse>(
      '/v1/auth/login',
      {
        email: input.email,
        verification_code: input.verificationCode,
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
    if (!window.tutorApp) {
      return null;
    }

    const rememberLogin = await getRememberLogin();
    if (!rememberLogin) {
      await window.tutorApp.clearAuth();
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
      await window.tutorApp.clearAuth();
      return null;
    }
  },

  async logout() {
    if (!window.tutorApp) {
      return;
    }

    const auth = await getAuthState();
    try {
      if (auth.refreshToken) {
        await backendClient.post('/v1/auth/logout', { refresh_token: auth.refreshToken }, false);
      }
    } finally {
      await window.tutorApp.clearAuth();
    }
  },
};
