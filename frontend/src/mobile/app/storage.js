/** AsyncStorage (@react-native-async-storage/async-storage) on localStorage. Never throws. */
const ls = () => {
  try { return window.localStorage; } catch { return null; }
};
export const AsyncStorage = {
  async getItem(k) { try { return ls()?.getItem(k) ?? null; } catch { return null; } },
  async setItem(k, v) { try { ls()?.setItem(k, v); } catch { /* quota / private mode */ } },
  async removeItem(k) { try { ls()?.removeItem(k); } catch { /* ignore */ } },
  async mergeItem(k, v) {
    const cur = await AsyncStorage.getItem(k);
    let merged = v;
    try { merged = JSON.stringify({ ...JSON.parse(cur || '{}'), ...JSON.parse(v) }); } catch { /* keep v */ }
    await AsyncStorage.setItem(k, merged);
  },
  async multiGet(keys) { return Promise.all(keys.map(async (k) => [k, await AsyncStorage.getItem(k)])); },
  async multiSet(pairs) { await Promise.all(pairs.map(([k, v]) => AsyncStorage.setItem(k, v))); },
  async multiRemove(keys) { await Promise.all(keys.map((k) => AsyncStorage.removeItem(k))); },
  async getAllKeys() { const s = ls(); return s ? Object.keys(s) : []; },
  async clear() { try { ls()?.clear(); } catch { /* ignore */ } },
};
export default AsyncStorage;
