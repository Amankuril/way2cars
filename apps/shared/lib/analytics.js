/**
 * Tiny funnel-analytics client shared by the renter app (Android) and its web replica. Events are
 * queued and sent in batches to POST /api/v1/public/analytics/events with an anonymous device id; the
 * access token is attached when the renter is signed in so the team can follow up on drop-offs.
 * Never throws and never blocks the UI — analytics is best-effort.
 */
const SESSION_IDLE_MS = 30 * 60_000;
const FLUSH_MS = 15_000;
const MAX_BATCH = 50;

const randomId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;

export function createAnalytics({ baseUrl, storage, platform, appVersion, getAccessToken }) {
  let deviceId = null;
  let sessionId = randomId();
  let lastEventAt = Date.now();
  let queue = [];
  let timer = null;
  let ready = null;

  async function init() {
    try {
      deviceId = await storage.get('w2c.analytics.device');
      if (!deviceId) {
        deviceId = randomId();
        await storage.set('w2c.analytics.device', deviceId);
        queue.push({ event: 'app_open', at: new Date().toISOString(), sessionId, props: { firstOpen: true } });
        return;
      }
    } catch {
      deviceId ||= randomId();
    }
    queue.push({ event: 'app_open', at: new Date().toISOString(), sessionId, props: { firstOpen: false } });
  }

  async function flush() {
    timer = null;
    await ready;
    if (!queue.length || !deviceId) return;
    const batch = queue.slice(0, MAX_BATCH);
    queue = queue.slice(MAX_BATCH);
    try {
      const token = getAccessToken?.();
      const res = await fetch(`${baseUrl}/api/v1/public/analytics/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ deviceId, platform, appVersion, events: batch }),
      });
      if (res.status >= 500 || res.status === 429) queue = [...batch, ...queue].slice(-200); // retry later
    } catch {
      queue = [...batch, ...queue].slice(-200);
    }
    if (queue.length) schedule();
  }

  function schedule(delay = FLUSH_MS) {
    if (!timer) timer = setTimeout(flush, delay);
  }

  ready = init().finally(() => schedule(3000));

  return {
    /** Records an event; props: { screen, vehicleId, bookingId, cityId, amountPaise, reason }. */
    track(event, props = {}) {
      const now = Date.now();
      if (now - lastEventAt > SESSION_IDLE_MS) {
        sessionId = randomId();
        queue.push({ event: 'app_open', at: new Date(now).toISOString(), sessionId, props: { firstOpen: false } });
      }
      lastEventAt = now;
      const clean = Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined && v !== null && v !== ''));
      queue.push({ event, at: new Date(now).toISOString(), sessionId, props: clean });
      if (queue.length >= 10) {
        clearTimeout(timer);
        timer = null;
        flush();
      } else schedule();
    },
    /** Sends what is queued now (e.g. when the app goes to the background). */
    flush: () => {
      clearTimeout(timer);
      return flush();
    },
  };
}
