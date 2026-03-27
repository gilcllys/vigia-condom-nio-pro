const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string || 'http://localhost:8000';

// ── Token management ────────────────────────────────────────────────────────

const TOKEN_KEY = 'nfe_vigia_tokens';

interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expires_at?: number; // unix seconds
  user?: any;
}

export function getStoredTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export function setStoredTokens(tokens: StoredTokens) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export function clearStoredTokens() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getAccessToken(): string | null {
  return getStoredTokens()?.access_token ?? null;
}

// ── Refresh logic ───────────────────────────────────────────────────────────

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const tokens = getStoredTokens();
  if (!tokens?.refresh_token) return null;

  const res = await fetch(`${API_BASE_URL}/api/auth/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: tokens.refresh_token }),
  });

  if (!res.ok) {
    clearStoredTokens();
    return null;
  }

  const data = await res.json();
  if (data.access_token) {
    setStoredTokens({
      access_token: data.access_token,
      refresh_token: data.refresh_token || tokens.refresh_token,
      expires_at: data.expires_at,
      user: data.user || tokens.user,
    });
    return data.access_token;
  }
  clearStoredTokens();
  return null;
}

async function getValidToken(): Promise<string | null> {
  const tokens = getStoredTokens();
  if (!tokens?.access_token) return null;

  // Check if token is about to expire (within 60 seconds)
  if (tokens.expires_at) {
    const now = Math.floor(Date.now() / 1000);
    if (now >= tokens.expires_at - 60) {
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null; });
      }
      return refreshPromise;
    }
  }

  return tokens.access_token;
}

// ── Main fetch helper ───────────────────────────────────────────────────────

/**
 * Makes an authenticated request to the Django backend.
 * Automatically manages JWT tokens.
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getValidToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  // Auto-refresh on 401
  if (res.status === 401 && token) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      return fetch(`${API_BASE_URL}${path}`, { ...options, headers });
    }
  }

  return res;
}

/**
 * Upload a file via multipart/form-data.
 */
export async function apiUpload(
  path: string,
  formData: FormData,
): Promise<Response> {
  const token = await getValidToken();

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  // Don't set Content-Type — browser sets it with boundary for multipart

  return fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  });
}

// ── Auth API helpers ────────────────────────────────────────────────────────

export const authApi = {
  async login(email: string, password: string) {
    const res = await fetch(`${API_BASE_URL}/api/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (res.ok && data.access_token) {
      setStoredTokens({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
        user: data.user,
      });
    }
    return { ok: res.ok, status: res.status, data };
  },

  async signUp(email: string, password: string, redirectTo?: string) {
    const res = await fetch(`${API_BASE_URL}/api/auth/signup/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, redirectTo }),
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  },

  async logout() {
    const token = getAccessToken();
    if (token) {
      await fetch(`${API_BASE_URL}/api/auth/logout/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      }).catch(() => {});
    }
    clearStoredTokens();
  },

  async forgotPassword(email: string, redirectTo?: string) {
    const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, redirectTo }),
    });
    return { ok: res.ok };
  },

  async updateUser(updates: Record<string, any>) {
    const res = await apiFetch('/api/auth/update-user/', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    return { ok: res.ok, data };
  },

  async getUser() {
    const res = await apiFetch('/api/auth/user/');
    if (!res.ok) return null;
    return await res.json();
  },

  async getSession() {
    const tokens = getStoredTokens();
    if (!tokens?.access_token) return null;
    return { user: tokens.user, access_token: tokens.access_token };
  },

  // MFA
  async mfaListFactors() {
    const res = await apiFetch('/api/auth/mfa/factors/');
    return await res.json();
  },

  async mfaEnroll(factorType = 'totp', friendlyName?: string) {
    const res = await apiFetch('/api/auth/mfa/enroll/', {
      method: 'POST',
      body: JSON.stringify({ factor_type: factorType, friendly_name: friendlyName }),
    });
    return await res.json();
  },

  async mfaChallenge(factorId: string) {
    const token = getAccessToken();
    const res = await fetch(`${API_BASE_URL}/api/auth/mfa/challenge/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ factorId }),
    });
    const data = await res.json();
    return { ok: res.ok, data };
  },

  async mfaVerify(factorId: string, challengeId: string, code: string) {
    const token = getAccessToken();
    const res = await fetch(`${API_BASE_URL}/api/auth/mfa/verify/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ factorId, challengeId, code }),
    });
    const data = await res.json();
    if (res.ok && data.access_token) {
      // MFA verify returns upgraded tokens
      const stored = getStoredTokens();
      setStoredTokens({
        access_token: data.access_token,
        refresh_token: data.refresh_token || stored?.refresh_token || '',
        expires_at: data.expires_at,
        user: data.user || stored?.user,
      });
    }
    return { ok: res.ok, data };
  },

  async mfaUnenroll(factorId: string) {
    const res = await apiFetch('/api/auth/mfa/unenroll/', {
      method: 'POST',
      body: JSON.stringify({ factorId }),
    });
    return { ok: res.ok };
  },
};

