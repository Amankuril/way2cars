import { PermissionsAndroid, Platform } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { api } from '../api';

const OPTIONS = { mediaType: 'photo', quality: 0.8, maxWidth: 2400, maxHeight: 2400, includeExtra: false };

async function cameraAllowed() {
  if (Platform.OS !== 'android') return true;
  const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
    title: 'Camera access', message: 'WAY2CARS needs the camera to photograph documents and the car.', buttonPositive: 'Allow',
  });
  return r === PermissionsAndroid.RESULTS.GRANTED;
}

/** Opens the camera (or gallery) and returns { uri, type, fileName } or null if cancelled. */
export async function pickImage({ source = 'camera', front = false } = {}) {
  if (source === 'camera' && !(await cameraAllowed())) throw new Error('Camera permission is needed. Enable it in Settings.');
  const res = source === 'camera' ? await launchCamera({ ...OPTIONS, saveToPhotos: false, cameraType: front ? 'front' : 'back' }) : await launchImageLibrary({ ...OPTIONS, selectionLimit: 1 });
  if (res.didCancel) return null;
  if (res.errorCode) throw new Error(res.errorMessage || 'Could not open the camera.');
  const a = res.assets?.[0];
  return a ? { uri: a.uri, type: a.type || 'image/jpeg', fileName: a.fileName || 'photo.jpg' } : null;
}

/** Uploads a picked asset for a purpose; returns the server file record. */
export function uploadAsset(asset, purpose) {
  const form = new FormData();
  form.append('purpose', purpose);
  form.append('file', { uri: asset.uri, type: asset.type, name: asset.fileName });
  return api.upload('/api/v1/user/uploads', form);
}
