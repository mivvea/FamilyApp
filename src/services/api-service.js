export class ApiService {
  constructor({ baseUrl, getAuthToken, onApiStatus }) {
    this.baseUrl = baseUrl;
    this.getAuthToken = getAuthToken;
    this.onApiStatus = onApiStatus;
  }

  getHeaders(extraHeaders = {}, body) {
    const authToken = this.getAuthToken();
    const headers = {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...extraHeaders,
    };

    if (body instanceof FormData) {
      return headers;
    }

    return {
      ...headers,
      'Content-Type': 'application/json',
    };
  }

  async request(path, options = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: this.getHeaders(options.headers, options.body),
      ...options,
    });

    const text = await response.text();
    let data = null;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      const message =
        (typeof data === 'object' && (data?.Message || data?.message || data?.title || data?.error)) ||
        (typeof data === 'string' && data) ||
        `HTTP ${response.status}`;
      throw new Error(message);
    }

    if (this.onApiStatus) {
      this.onApiStatus(`Connected to ${path}`);
    }

    return data;
  }
}
