/**
 * Web image picker with the same contract as apps/shared/native/app/media.js:
 *   pickImage({ source: 'camera' | 'gallery', front }) → { uri, type, fileName, file } | null (cancelled)
 * A hidden <input type=file> is used; `capture` opens the camera on phones (desktop shows a file
 * dialog). Large photos are downscaled to 2400px / JPEG 0.8 like the native picker options.
 *
 * Must be called synchronously from a press handler (browsers only open file dialogs on a user
 * gesture) — `useUploader().take()` does this.
 */
const MAX_DIM = 2400;
const QUALITY = 0.8;

async function shrink(file) {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) || typeof createImageBitmap === 'undefined') return file;
  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    return file; // undecodable (e.g. HEIC on desktop) — let the server decide
  }
  const scale = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 1.5 * 1024 * 1024) { bmp.close?.(); return file; }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', QUALITY));
  if (!blob || blob.size >= file.size) return file;
  const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
}

export function pickImage({ source = 'camera', front = false, accept = 'image/*' } = {}) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (source === 'camera') input.setAttribute('capture', front ? 'user' : 'environment');
    input.style.cssText = 'position:fixed;left:-9999px;opacity:0';
    document.body.appendChild(input);
    let settled = false;
    const finish = (value, error) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onWindowFocus);
      input.remove();
      if (error) reject(error);
      else resolve(value);
    };
    // Browsers without the 'cancel' event: the window regains focus when the dialog closes.
    const onWindowFocus = () => setTimeout(() => { if (!input.files?.length) finish(null); }, 1000);
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      if (!f) return finish(null);
      try {
        const file = await shrink(f);
        finish({ uri: URL.createObjectURL(file), type: file.type || 'image/jpeg', fileName: file.name || 'photo.jpg', file });
      } catch (e) {
        finish(null, new Error(e?.message || 'Could not read the photo.'));
      }
    });
    input.addEventListener('cancel', () => finish(null));
    window.addEventListener('focus', onWindowFocus, { once: true });
    input.click();
  });
}

/** Uploads a picked asset for a purpose; returns the server file record { id, url }. */
export function uploadAsset(api, realm, asset, purpose) {
  const form = new FormData();
  form.append('purpose', purpose);
  form.append('file', asset.file, asset.fileName);
  return api.upload(`/api/v1/${realm}/uploads`, form);
}
