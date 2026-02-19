import { useAuthStore } from '../stores/auth.js';

const BASE_URL = '/api';

class ApiClient {
  private getHeaders(hasBody = false): HeadersInit {
    const auth = useAuthStore();
    const headers: HeadersInit = {};
    if (hasBody) headers['Content-Type'] = 'application/json';
    if (auth.accessToken) headers['Authorization'] = `Bearer ${auth.accessToken}`;
    return headers;
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, { headers: this.getHeaders() });
    if (!res.ok) throw await this.handleError(res);
    return res.json();
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: this.getHeaders(!!body),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw await this.handleError(res);
    return res.json();
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'PUT',
      headers: this.getHeaders(true),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await this.handleError(res);
    return res.json();
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'PATCH',
      headers: this.getHeaders(true),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await this.handleError(res);
    return res.json();
  }

  async delete(path: string): Promise<void> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!res.ok) throw await this.handleError(res);
  }

  private async handleError(res: Response) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    return new Error(body.message || `Request failed: ${res.status}`);
  }
}

export const api = new ApiClient();
