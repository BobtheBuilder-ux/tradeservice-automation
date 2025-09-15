import { useState, useEffect } from 'react';
import { apiClient } from './api';

// Authentication state management
class AuthManager {
  constructor() {
    this.user = null;
    this.isAuthenticated = false;
    this.listeners = [];
  }

  // Subscribe to auth state changes
  onAuthStateChange(callback) {
    this.listeners.push(callback);
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  }

  // Notify all listeners of auth state change
  notifyListeners() {
    this.listeners.forEach(callback => {
      callback(this.user, this.isAuthenticated);
    });
  }

  // Initialize auth state from stored token
  async initialize() {
    const token = apiClient.getAuthToken();
    console.log('Initializing auth, token from localStorage:', token ? 'present' : 'not found');
    if (token) {
      try {
        console.log('Verifying token with /api/auth/me endpoint');
        // Verify token is still valid by checking user info
        const response = await apiClient.request('/api/auth/me');
        this.isAuthenticated = true;
        this.user = response.user;
        this.notifyListeners();
        console.log('Token verified successfully, user:', this.user);
      } catch (error) {
        console.error('Token verification failed:', error);
        // Token is invalid, clear it
        await this.signOut();
      }
    } else {
      console.log('No token found, user not authenticated');
    }
  }

  // Sign up new user
  async signUp(userData) {
    try {
      const response = await apiClient.register(userData);
      
      if (response.token) {
        console.log('Sign up successful, saving token to localStorage:', response.token);
        apiClient.setAuthToken(response.token);
        this.user = response.user || { email: userData.email };
        this.isAuthenticated = true;
        this.notifyListeners();
        console.log('User authenticated:', this.user);
      }
      
      return { data: response, error: null };
    } catch (error) {
      console.error('Sign up error:', error);
      return { data: null, error: { message: error.message } };
    }
  }

  // Sign in existing user
  async signIn(credentials) {
    try {
      const response = await apiClient.login(credentials);
      
      if (response.token) {
        console.log('Sign in successful, saving token to localStorage:', response.token);
        apiClient.setAuthToken(response.token);
        this.user = response.user || { email: credentials.email };
        this.isAuthenticated = true;
        this.notifyListeners();
        console.log('User authenticated:', this.user);
      }
      
      return { data: response, error: null };
    } catch (error) {
      console.error('Sign in error:', error);
      return { data: null, error: { message: error.message } };
    }
  }

  // Sign out user
  async signOut() {
    try {
      console.log('Signing out user, clearing token from localStorage');
      await apiClient.logout();
      apiClient.setAuthToken(null);
      this.user = null;
      this.isAuthenticated = false;
      this.notifyListeners();
      console.log('User signed out successfully');
      return { error: null };
    } catch (error) {
      console.error('Sign out error:', error);
      return { error: { message: error.message } };
    }
  }

  // Reset password
  async resetPassword(email) {
    try {
      const response = await apiClient.forgotPassword(email);
      return { data: response, error: null };
    } catch (error) {
      return { data: null, error: { message: error.message } };
    }
  }

  // Update password with reset token
  async updatePassword(token, newPassword) {
    try {
      const response = await apiClient.resetPassword(token, newPassword);
      return { data: response, error: null };
    } catch (error) {
      return { data: null, error: { message: error.message } };
    }
  }

  // Verify email
  async verifyEmail(token) {
    try {
      const response = await apiClient.verifyEmail(token);
      return { data: response, error: null };
    } catch (error) {
      return { data: null, error: { message: error.message } };
    }
  }

  // Get current user
  getUser() {
    return this.user;
  }

  // Check if user is authenticated
  isUserAuthenticated() {
    return this.isAuthenticated;
  }
}

// Create and export singleton instance
export const authManager = new AuthManager();

// Initialize auth state when module loads (client-side only)
if (typeof window !== 'undefined') {
  authManager.initialize();
}

// Validate user permissions based on role
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

  const role = user.role || 'user';
  
  return {
    canViewLeads: ['admin', 'agent', 'user'].includes(role),
    canEditLeads: ['admin', 'agent'].includes(role),
    canDeleteLeads: ['admin'].includes(role),
    canManageAgents: ['admin'].includes(role),
    canViewReports: ['admin', 'agent'].includes(role),
    canViewAnalytics: ['admin', 'agent'].includes(role)
  };
};

// React hook for authentication
export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initialize auth state
    const initAuth = async () => {
      await authManager.initialize();
      setUser(authManager.getUser());
      setLoading(false);
    };

    initAuth();

    // Subscribe to auth state changes
    const unsubscribe = authManager.onAuthStateChange((user, isAuthenticated) => {
      setUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return { user, loading, isAuthenticated: !!user };
};

// Export individual functions for backward compatibility
export const signUp = (userData) => authManager.signUp(userData);
export const signIn = (credentials) => authManager.signIn(credentials);
export const signOut = () => authManager.signOut();
export const resetPassword = (email) => authManager.resetPassword(email);
export const updatePassword = (token, newPassword) => authManager.updatePassword(token, newPassword);
export const verifyEmail = (token) => authManager.verifyEmail(token);
export const getUser = () => authManager.getUser();
export const isAuthenticated = () => authManager.isUserAuthenticated();
export const onAuthStateChange = (callback) => authManager.onAuthStateChange(callback);

// Export the manager class
export default AuthManager;