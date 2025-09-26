// API client for communicating with the backend server

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

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
    // Ensure endpoint starts with /api for backend routes
    const apiEndpoint = endpoint.startsWith('/api') ? endpoint : `/api${endpoint}`;
    const url = `${this.baseURL}${apiEndpoint}`;
    const token = this.getAuthToken();

    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
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
      console.error('API request failed:', error);
      throw error;
    }
  }

  // Authentication methods
  async register(userData) {
    const response = await this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
    
    if (response.token) {
      this.setAuthToken(response.token);
    }
    
    return response;
  }

  async login(credentials) {
    const response = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    
    if (response.token) {
      this.setAuthToken(response.token);
    }
    
    return response;
  }

  async logout() {
    this.setAuthToken(null);
    return { success: true };
  }

  async forgotPassword(email) {
    return await this.request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(token, newPassword) {
    return await this.request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    });
  }

  async verifyEmail(token) {
    return await this.request('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  async testEmail(email) {
    return await this.request('/api/auth/test-email', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
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