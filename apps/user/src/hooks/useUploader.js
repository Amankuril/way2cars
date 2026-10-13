import { useCallback, useState } from 'react';
import { pickImage, uploadAsset } from '../services/media';

/**
 * Manages a set of upload slots: { [key]: { state, uri, fileId, error } }.
 * take(key, purpose) opens the camera/gallery and uploads; failed uploads can be retried.
 */
export function useUploader() {
  const [slots, setSlots] = useState({});
  const set = (key, patch) => setSlots((s) => ({ ...s, [key]: { ...s[key], ...patch } }));

  const take = useCallback(async (key, purpose, { source = 'camera', front = false } = {}) => {
    let asset;
    try {
      asset = await pickImage({ source, front });
    } catch (e) {
      set(key, { state: 'error', error: e.message });
      return;
    }
    if (!asset) return;
    set(key, { state: 'uploading', uri: asset.uri, error: null });
    try {
      const f = await uploadAsset(asset, purpose);
      set(key, { state: 'done', fileId: f.id });
    } catch (e) {
      set(key, { state: 'error', error: e.message });
    }
  }, []);

  const ids = (keys) => keys.map((k) => slots[k]?.fileId).filter(Boolean);
  const busy = Object.values(slots).some((s) => s.state === 'uploading');
  const remove = (key) => setSlots(({ [key]: _gone, ...rest }) => rest);
  return { slots, take, ids, busy, remove };
}
