// API client for communicating with the backend server

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_INSFORGE_API_BASE_URL || process.env.NEXT_PUBLIC_INSFORGE_URL || '';

class ApiClient {
  constructor() {
    this.baseURL = API_BASE_URL;
    this.token = null;
  }

  setAuthToken(token) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('auth_token', token);
      } else {
        localStorage.removeItem('auth_token');
      }
    }
  }

  getAuthToken() {
    if (this.token) return this.token;
    if (typeof window !== 'undefined') {
      return localStorage.getItem('auth_token');
    }
    return null;
  }

  async request(endpoint, options = {}) {
    const { silent = false, ...fetchOptions } = options;
    // Ensure endpoint starts with /api for backend routes
    const apiEndpoint = endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`;
    const url = `${this.baseURL}${apiEndpoint}`;
    const token = this.getAuthToken();

    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers,
      },
      ...fetchOptions,
    };

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      return data;
    } catch (error) {
      if (!silent) {
        console.error('[ApiClient.request] Request failed:', error);
      }
      throw error;
    }
  }

  // Authentication methods
  async register() {
    throw new Error('Password registration has been removed. Use Google sign-in.');
  }

  async login() {
    throw new Error('Password login has been removed. Use Google sign-in.');
  }

  async logout() {
    this.setAuthToken(null);
    return { success: true };
  }

  async forgotPassword() {
    throw new Error('Password reset has been removed. Use Google sign-in.');
  }

  async resetPassword() {
    throw new Error('Password reset has been removed. Use Google sign-in.');
  }

  async verifyEmail() {
    throw new Error('Email verification is handled by Google and InsForge.');
  }

  async testEmail() {
    throw new Error('Legacy authentication test email has been removed.');
  }

  // Health check
  async healthCheck() {
    return await this.request('/health');
  }

  // Server info
  async getServerInfo() {
    return await this.request('/');
  }

  // HTTP method shortcuts
  async get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  async post(endpoint, data = null, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put(endpoint, data = null, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }

  // Integrations
  async getIntegrationStatus() {
    return this.get('/integrations/status');
  }

  async getCalendlyAuthUrl(redirect) {
    const encoded = redirect ? `?redirect=${encodeURIComponent(redirect)}` : '';
    return this.get(`/integrations/calendly/start${encoded}`);
  }
}

// Create and export a singleton instance
export const apiClient = new ApiClient();

// Export the singleton instance as default (not the class)
export default apiClient;