/**
 * Authenticated downloads (replaces react-native-blob-util in apps/user/src/services/files.js).
 * openPdf opens the window synchronously (popup blockers) and then loads the blob into it.
 */
async function fetchBlob(api, path) {
  const res = await api.raw(path, { timeout: 60000 });
  if (!res || typeof res.blob !== 'function') throw new Error('Could not download the file. Please try again.');
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') || '';
  const name = /filename="?([^";]+)"?/i.exec(cd)?.[1] || null;
  return { blob, name, type: res.headers.get('content-type') || blob.type };
}

/** Saves an authenticated file with the server's (or the given) file name. Returns the name. */
export async function downloadFile(api, path, fileName) {
  const { blob, name } = await fetchBlob(api, path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || name || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return a.download;
}

/** Opens an authenticated PDF (invoice) in a new tab; falls back to a download if popups are blocked. */
export async function openPdf(api, path, fileName) {
  const win = window.open('', '_blank');
  try {
    const { blob, type } = await fetchBlob(api, path);
    const typed = type?.includes('pdf') ? blob : new Blob([blob], { type: 'application/pdf' });
    const url = URL.createObjectURL(typed);
    if (win) win.location.href = url;
    else {
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'document.pdf';
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return url;
  } catch (e) {
    win?.close();
    throw e;
  }
}
