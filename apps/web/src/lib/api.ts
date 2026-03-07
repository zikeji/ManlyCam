/**
 * Typed error from apiFetch with status code and error code from server
 */
export class ApiFetchError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string = 'UNKNOWN',
  ) {
    super(message);
    this.name = 'ApiFetchError';
  }
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: { Accept: 'application/json', ...options?.headers },
  });

  if (!res.ok) {
    let code = 'UNKNOWN';
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: { message?: string; code?: string } };
      message = body?.error?.message ?? message;
      code = body?.error?.code ?? code;
    } catch (err) {
      console.warn('Failed to parse error response body:', err);
    }
    throw new ApiFetchError(message, res.status, code);
  }

  return res.json() as Promise<T>;
}
