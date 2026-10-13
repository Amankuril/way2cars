/** fetch with timeout + bounded retries on network errors / 5xx (only for idempotent calls). */
export async function fetchWithRetry(url, options = {}, { timeoutMs = 8000, retries = 0, retryOn = (r) => r.status >= 500 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
      if (attempt < retries && retryOn(res)) {
        lastErr = new Error(`HTTP ${res.status}`);
      } else {
        return res;
      }
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
  }
  throw lastErr;
}
