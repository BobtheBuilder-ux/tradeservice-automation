import { useState, useEffect } from 'react';
import { apiClient } from './api';
import { insforge } from './insforge';

const AUTH_TOKEN_STORAGE_KEY = 'auth_token';

export function getInsForgeAccessToken() {
  if (typeof window === 'undefined') return null;

  const headers = insforge.getHttpClient().getHeaders();
  const authorization = headers.Authorization || headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) return null;

  return authorization.slice(7);
}

export function syncApiClientWithInsForge() {
  const token = getInsForgeAccessToken();
  apiClient.setAuthToken(token);
  return token;
}

class AuthManager {
  constructor() {
    this.user = null;
    this.isAuthenticated = false;
    this.listeners = [];
    this.initialized = false;
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
        this.clearLocalState();
        return;
      }

      const token = syncApiClientWithInsForge();
      if (!token) {
        this.clearLocalState();
        return;
      }

      let response;
      try {
        response = await apiClient.request('/api/auth/me', { silent: true });
      } catch {
        this.clearLocalState();
        this.notifyListeners();
        return;
      }

      this.user = response.user;
      this.isAuthenticated = true;
      this.initialized = true;
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

    const { error } = await insforge.auth.signInWithOAuth('google', {
      redirectTo,
      additionalParams: { prompt: 'select_account' },
    });

    if (error) {
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
    apiClient.setAuthToken(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
    this.user = null;
    this.isAuthenticated = false;
    this.initialized = true;
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

  const role = user.role || 'agent';
  
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      await authManager.initialize();
      setUser(authManager.getUser());
      setLoading(false);
    };

    initAuth();

    const unsubscribe = authManager.onAuthStateChange((nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return { user, loading, isAuthenticated: !!user };
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
