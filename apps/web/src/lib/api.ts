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
    throw Object.assign(new Error(message), {
      status: res.status,
      code,
    });
  }

  return res.json() as Promise<T>;
}
