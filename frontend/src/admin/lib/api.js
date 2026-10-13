import { createApiClient, ApiError } from '@shared/lib/api-client.js';

/**
 * Single API client for the admin app. Same-origin in production (Nginx serves /admin and /api)
 * and in development (Vite proxies /api), so the base URL is relative and the httpOnly refresh
 * cookie scoped to /api/v1/auth/admin is sent automatically.
 */
const listeners = new Set();
export const onSessionExpired = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const api = createApiClient({
  baseUrl: '',
  realm: 'admin',
  clientType: 'web',
  onSessionExpired: () => listeners.forEach((fn) => fn()),
});

export const ADMIN = '/api/v1/admin';
export { ApiError };

/** Fetches an authenticated binary resource (private file, PDF, CSV) as a Blob. */
export async function fetchBlob(path, query) {
  const res = await api.raw(path, { query, timeout: 60000 });
  if (!res || typeof res.blob !== 'function') throw new ApiError({ code: 'UNKNOWN', message: 'Could not download the file.' });
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return { blob, filename: match?.[1] || null, type: res.headers.get('content-type') || blob.type };
}

/** Downloads an authenticated resource and saves it with the server's file name. */
export async function downloadFile(path, { query, fallbackName = 'download' } = {}) {
  const { blob, filename } = await fetchBlob(path, query);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Opens an authenticated resource in a new tab via a blob URL (popup opened synchronously first). */
export async function openFileInNewTab(path) {
  const win = window.open('', '_blank');
  try {
    const { blob, type } = await fetchBlob(path);
    // Re-type PDFs so the browser renders them instead of downloading (server sends attachment).
    const typed = type?.includes('pdf') ? new Blob([blob], { type: 'application/pdf' }) : blob;
    const url = URL.createObjectURL(typed);
    if (win) win.location.href = url;
    else window.location.assign(url);
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch (err) {
    win?.close();
    throw err;
  }
}

/** Uploads a file for an admin-owned purpose. Returns { id, url, ... }. */
export function uploadFile(file, purpose) {
  const fd = new FormData();
  fd.append('purpose', purpose);
  fd.append('file', file);
  return api.upload(`${ADMIN}/uploads`, fd);
}
