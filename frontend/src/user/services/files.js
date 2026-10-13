import { openPdf } from '@/mobile/app/files';
import { api } from '../api';

/** Downloads an authenticated PDF (invoice) and opens it (web: new tab, or a download if popups are blocked). */
export async function downloadPdf(path, fileName) {
  try {
    return await openPdf(api, path, fileName);
  } catch {
    throw new Error('Could not download the invoice. Please try again.');
  }
}
