import { useState, useEffect } from 'react';
import { insforge } from './insforge';

const AUTH_TOKEN_STORAGE_KEY = 'auth_token';
const AUTH_PENDING_STORAGE_KEY = 'insforge_google_auth_pending';

export function getInsForgeAccessToken() {
  if (typeof window === 'undefined') return null;

  const headers = insforge.getHttpClient().getHeaders();
  const authorization = headers.Authorization || headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) return null;

  return authorization.slice(7);
}

export function syncLegacyAuthTokenWithInsForge() {
  const token = getInsForgeAccessToken();
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
  }
  return token;
}

function getProfileName(insforgeUser) {
  const profile = insforgeUser?.profile || {};
  const metadata = insforgeUser?.metadata || insforgeUser?.user_metadata || {};
  return (
    profile.name ||
    profile.full_name ||
    metadata.name ||
    metadata.full_name ||
    insforgeUser?.email ||
    'Admin'
  );
}

function buildFallbackPortalUser(insforgeUser) {
  return {
    id: insforgeUser.id,
    authUserId: insforgeUser.id,
    tenantId: null,
    tenant: null,
    tenantRole: 'admin',
    tenantUserId: null,
    email: insforgeUser.email,
    name: getProfileName(insforgeUser),
    role: 'admin',
    emailVerified: Boolean(insforgeUser.emailVerified ?? insforgeUser.email_verified ?? true),
    redirectTo: '/admin-dashboard',
  };
}

function normalizePortalUser(portalUser, insforgeUser) {
  const redirectTo = portalUser?.redirectTo || portalUser?.redirect_to || '/admin-dashboard';

  return {
    ...buildFallbackPortalUser(insforgeUser),
    ...(portalUser || {}),
    role: 'admin',
    tenantRole: portalUser?.tenantRole || portalUser?.tenant_role || 'admin',
    authUserId: portalUser?.authUserId || portalUser?.auth_user_id || insforgeUser.id,
    tenantId: portalUser?.tenantId || portalUser?.tenant_id || null,
    tenantUserId: portalUser?.tenantUserId || portalUser?.tenant_user_id || null,
    redirectTo,
  };
}

async function resolvePortalUserWithInsForge(insforgeUser) {
  const { data, error } = await insforge.database.rpc('resolve_current_portal_user');
  if (error) {
    throw error;
  }
  return normalizePortalUser(data, insforgeUser);
}

class AuthManager {
  constructor() {
    this.user = null;
    this.isAuthenticated = false;
    this.listeners = [];
    this.initialized = false;
    this.lastError = null;
  }

  onAuthStateChange(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  }

  notifyListeners() {
    this.listeners.forEach(callback => {
      callback(this.user, this.isAuthenticated);
    });
  }

  async initialize() {
    if (this.initialized && this.user) return;

    try {
      const { data, error } = await insforge.auth.getCurrentUser();
      if (error || !data?.user) {
        if (this.hasPendingGoogleAuth()) {
          this.lastError = error?.message ||
            'Google sign-in did not complete. Please try again with the same browser window.';
        }
        this.clearLocalState();
        return;
      }

      const token = syncLegacyAuthTokenWithInsForge();
      if (!token) {
        this.clearLocalState();
        return;
      }

      let portalUser;
      try {
        portalUser = await resolvePortalUserWithInsForge(data.user);
      } catch (profileError) {
        console.error('InsForge portal profile resolution failed:', profileError);
        this.lastError =
          profileError?.message ||
          'Your account was created, but the workspace could not be prepared. Please try again.';
        this.clearLocalState();
        this.notifyListeners();
        return;
      }

      this.user = portalUser;
      this.isAuthenticated = true;
      this.initialized = true;
      this.lastError = null;
      this.clearPendingGoogleAuth();
      this.notifyListeners();
    } catch {
      this.clearLocalState();
      this.notifyListeners();
    }
  }

  async signInWithGoogle() {
    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}/login`
      : '/login';

    this.lastError = null;
    this.clearLocalState();
    this.markPendingGoogleAuth();

    const { error } = await insforge.auth.signInWithOAuth('google', {
      redirectTo,
      additionalParams: { prompt: 'select_account' },
    });

    if (error) {
      this.lastError = error.message || 'Google sign-in failed';
      this.clearPendingGoogleAuth();
      return { data: null, error: { message: error.message || 'Google sign-in failed' } };
    }

    return { data: { provider: 'google' }, error: null };
  }

  async signIn() {
    return this.signInWithGoogle();
  }

  async signUp() {
    return this.signInWithGoogle();
  }

  async signOut() {
    try {
      await insforge.auth.signOut();
    } catch (error) {
      console.error('InsForge sign out failed:', error);
    }

    this.clearLocalState();
    this.notifyListeners();
    return { error: null };
  }

  clearLocalState() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
    this.user = null;
    this.isAuthenticated = false;
    this.initialized = true;
  }

  markPendingGoogleAuth() {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(AUTH_PENDING_STORAGE_KEY, '1');
    }
  }

  hasPendingGoogleAuth() {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(AUTH_PENDING_STORAGE_KEY) === '1';
  }

  clearPendingGoogleAuth() {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(AUTH_PENDING_STORAGE_KEY);
    }
  }

  getLastError() {
    return this.lastError;
  }

  async resetPassword() {
    return {
      data: null,
      error: { message: 'Password reset is no longer used. Please sign in with Google.' },
    };
  }

  async updatePassword() {
    return {
      data: null,
      error: { message: 'Password login is no longer used. Please sign in with Google.' },
    };
  }

  async verifyEmail() {
    return {
      data: null,
      error: { message: 'Email verification is handled by Google and InsForge.' },
    };
  }

  getUser() {
    return this.user;
  }

  isUserAuthenticated() {
    return this.isAuthenticated;
  }
}

export const authManager = new AuthManager();

if (typeof window !== 'undefined') {
  authManager.initialize();
}

export const validatePermissions = (user) => {
  if (!user) {
    return {
      canViewLeads: false,
      canEditLeads: false,
      canDeleteLeads: false,
      canManageAgents: false,
      canViewReports: false,
      canViewAnalytics: false
    };
  }

  const role = user.role || 'admin';
  
  return {
    canViewLeads: ['admin', 'agent'].includes(role),
    canEditLeads: ['admin', 'agent'].includes(role),
    canDeleteLeads: ['admin'].includes(role),
    canManageAgents: ['admin'].includes(role),
    canViewReports: ['admin', 'agent'].includes(role),
    canViewAnalytics: ['admin', 'agent'].includes(role)
  };
};

export const useAuth = () => {
  const [user, setUser] = useState(authManager.getUser());
  const [error, setError] = useState(authManager.getLastError());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      await authManager.initialize();
      setUser(authManager.getUser());
      setError(authManager.getLastError());
      setLoading(false);
    };

    initAuth();

    const unsubscribe = authManager.onAuthStateChange((nextUser) => {
      setUser(nextUser);
      setError(authManager.getLastError());
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return { user, error, loading, isAuthenticated: !!user };
};

export const signUp = () => authManager.signUp();
export const signIn = () => authManager.signInWithGoogle();
export const signInWithGoogle = () => authManager.signInWithGoogle();
export const signOut = () => authManager.signOut();
export const resetPassword = (email) => authManager.resetPassword(email);
export const updatePassword = (token, newPassword) => authManager.updatePassword(token, newPassword);
export const verifyEmail = (token) => authManager.verifyEmail(token);
export const getUser = () => authManager.getUser();
export const isAuthenticated = () => authManager.isUserAuthenticated();
export const onAuthStateChange = (callback) => authManager.onAuthStateChange(callback);

export default AuthManager;
