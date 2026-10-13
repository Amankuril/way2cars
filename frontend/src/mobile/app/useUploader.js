import { useCallback, useState } from 'react';
import { pickImage, uploadAsset } from './media';
import { useApp } from './AppContext';

/**
 * Manages upload slots: { [key]: { state, uri, fileId, url, error } } — same as the native hook.
 * take(key, purpose, { source, front }) opens the camera/gallery and uploads.
 */
export function useUploader(initial = {}) {
  const { api, realm } = useApp();
  const [slots, setSlots] = useState(initial);
  const set = (key, patch) => setSlots((s) => ({ ...s, [key]: { ...s[key], ...patch } }));

  const take = useCallback(async (key, purpose, { source = 'camera', front = false } = {}) => {
    let asset;
    try {
      asset = await pickImage({ source, front });
    } catch (e) {
      set(key, { state: 'error', error: e.message });
      return null;
    }
    if (!asset) return null;
    set(key, { state: 'uploading', uri: asset.uri, error: null });
    try {
      const f = await uploadAsset(api, realm, asset, purpose);
      set(key, { state: 'done', fileId: f.id, url: f.url });
      return f;
    } catch (e) {
      set(key, { state: 'error', error: e.message });
      return null;
    }
  }, [api, realm]);

  const ids = (keys) => keys.map((k) => slots[k]?.fileId).filter(Boolean);
  const busy = Object.values(slots).some((s) => s.state === 'uploading');
  const remove = (key) => setSlots(({ [key]: _gone, ...rest }) => rest);
  return { slots, setSlots, take, ids, busy, remove };
}
