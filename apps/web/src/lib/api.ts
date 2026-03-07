export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: 'include',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body?.error?.message ?? 'Request failed'), {
      status: res.status,
      code: body?.error?.code ?? 'UNKNOWN',
    });
  }

  return res.json() as Promise<T>;
}
