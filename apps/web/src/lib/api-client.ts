/** Browser-side API calls. They go through the Next.js proxy (/api/v1/*), never to the API directly. */

export interface ApiIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: ApiIssue[] = [],
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });

  if (res.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new ApiError(401, 'Session expired');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: unknown; issues?: ApiIssue[] };
    const message = typeof body.message === 'string' ? body.message : 'Something went wrong';
    throw new ApiError(res.status, message, body.issues);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const apiJson = (method: 'POST' | 'PATCH' | 'PUT', body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});
