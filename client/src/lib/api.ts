export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

/** Prepend the backend base URL to a path, e.g. apiUrl('/api/stats') */
export const apiUrl = (path: string): string => `${API_URL}${path}`;
