/** @react-native-community/netinfo on navigator.onLine + online/offline events. */
const state = () => {
  const on = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  return { isConnected: on, isInternetReachable: on, type: on ? 'other' : 'none', details: null };
};
const NetInfo = {
  fetch: async () => state(),
  /** Calls cb now and on every change; returns an unsubscribe function (like NetInfo). */
  addEventListener(cb) {
    const on = () => cb(state());
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    on();
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  },
  useNetInfo: undefined,
};
export default NetInfo;
export { NetInfo };
