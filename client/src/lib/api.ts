export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

/** Prepend the backend base URL to a path, e.g. apiUrl('/api/stats') */
export const apiUrl = (path: string): string => `${API_URL}${path}`;

/** Build an uncached backend URL by appending a cache-busting query param. */
export const apiFreshUrl = (path: string): string => {
  const separator = path.includes('?') ? '&' : '?';
  return `${apiUrl(path)}${separator}_=${Date.now()}`;
};

/** Thin fetch wrapper that can opt into always-fresh responses from the backend. */
export const apiFetch = (
  path: string,
  init: RequestInit = {},
  options: { fresh?: boolean } = {},
): Promise<Response> => {
  const headers = new Headers(init.headers);

  if (options.fresh) {
    headers.set('Cache-Control', 'no-store');
    headers.set('Pragma', 'no-cache');
  }

  return fetch(options.fresh ? apiFreshUrl(path) : apiUrl(path), {
    ...init,
    cache: options.fresh ? 'no-store' : init.cache,
    headers,
  });
};
