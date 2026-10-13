/**
 * Current position or null (permission denied / unavailable / insecure origin).
 * Same contract as apps/shared/native/app/location.js. Browsers only allow geolocation on HTTPS
 * or localhost, so on a plain-HTTP deployment this resolves null and callers fall back gracefully.
 */
export function currentPosition({ timeout = 8000 } = {}) {
  if (typeof navigator === 'undefined' || !navigator.geolocation || (typeof window !== 'undefined' && window.isSecureContext === false)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout, maximumAge: 120000 },
    );
  });
}
