/**
 * Push notifications are not available on the web build (FCM web push is not set up).
 * Same API as apps/shared/native/app/push.js; every call is a harmless no-op so flows never block.
 * The in-app inbox (NotificationsScreen) still works.
 */
export async function registerForPush() {
  return 'unsupported';
}
export async function unregisterPush() {}
export function onForegroundMessage() {
  return () => {};
}
export const pushSupported = false;
