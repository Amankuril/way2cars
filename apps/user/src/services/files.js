import ReactNativeBlobUtil from 'react-native-blob-util';
import { api } from '../api';
import { ENV } from '../env';

/** Downloads an authenticated PDF (invoice) to Downloads and opens it. */
export async function downloadPdf(path, fileName) {
  const dirs = ReactNativeBlobUtil.fs.dirs;
  const res = await ReactNativeBlobUtil.config({
    fileCache: true,
    addAndroidDownloads: { useDownloadManager: false, notification: false, path: `${dirs.DownloadDir}/${fileName}`, mime: 'application/pdf' },
    path: `${dirs.DownloadDir}/${fileName}`,
  }).fetch('GET', `${ENV.apiBaseUrl}${path}`, { Authorization: `Bearer ${api.getAccessToken()}`, 'X-W2C-Client': 'native' });
  if (res.info().status !== 200) throw new Error('Could not download the invoice. Please try again.');
  await ReactNativeBlobUtil.android.actionViewIntent(res.path(), 'application/pdf');
  return res.path();
}
