import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch } from './api';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeResponse(status: number, body?: unknown, ok = status >= 200 && status < 300) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body ?? {}),
    text: vi.fn().mockResolvedValue(body ? JSON.stringify(body) : ''),
  };
}

describe('apiFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns parsed JSON on success', async () => {
    mockFetch.mockResolvedValue(makeResponse(200, { data: 'ok' }));
    const result = await apiFetch<{ data: string }>('/api/test');
    expect(result).toEqual({ data: 'ok' });
  });

  it('returns undefined on 204 No Content without calling json()', async () => {
    const res = makeResponse(204);
    mockFetch.mockResolvedValue(res);
    const result = await apiFetch('/api/test');
    expect(result).toBeUndefined();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('throws ApiFetchError with message and code from server on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: vi.fn().mockResolvedValue({ error: { message: 'Forbidden', code: 'FORBIDDEN' } }),
    });
    await expect(apiFetch('/api/test')).rejects.toMatchObject({
      name: 'ApiFetchError',
      message: 'Forbidden',
      status: 403,
      code: 'FORBIDDEN',
    });
  });

  it('falls back to generic message when error body has no error field', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({}),
    });
    await expect(apiFetch('/api/test')).rejects.toMatchObject({
      message: 'Request failed (500)',
      code: 'UNKNOWN',
    });
  });

  it('falls back to generic message when error body fails to parse', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn().mockRejectedValue(new SyntaxError('invalid json')),
    });
    await expect(apiFetch('/api/test')).rejects.toMatchObject({
      message: 'Request failed (503)',
      code: 'UNKNOWN',
    });
  });

  it('passes credentials and Accept header', async () => {
    mockFetch.mockResolvedValue(makeResponse(200, {}));
    await apiFetch('/api/test', { method: 'POST' });
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ Accept: 'application/json' }),
        method: 'POST',
      }),
    );
  });
});
