import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from './api';
import { $auth } from '@/stores/auth';

const mockFetch = vi.fn();

describe('ApiClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    $auth.set({
      accessToken: 'test-token',
      refreshToken: 'r',
      user: null,
      requiresTotp: false,
    });
  });

  it('should add Authorization header when authenticated', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    await api.get('/users/me');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/users/me',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
  });

  it('should return parsed JSON on get', async () => {
    const data = { id: '1', name: 'test' };
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(data) });
    const result = await api.get<{ id: string; name: string }>('/users/me');
    expect(result).toEqual(data);
  });

  it('should throw on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Forbidden',
      json: () => Promise.resolve({ message: 'Forbidden' }),
    });
    await expect(api.get('/users/me')).rejects.toThrow();
  });

  it('should send body and Content-Type on post', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    await api.post('/users', { name: 'x' });
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/users',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: 'x' }),
      }),
    );
  });
});
