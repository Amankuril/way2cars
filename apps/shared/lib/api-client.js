/**
 * Platform-agnostic WAY2CARS API client used by the native apps and the admin web app.
 *  - Access token kept in memory; refresh token via the injected store (Keychain on Android,
 *    httpOnly cookie on web — in which case getRefresh() returns null and the cookie is sent).
 *  - Single-flight refresh: concurrent 401s share one refresh call, then retry once.
 *  - Every failure is an ApiError with a stable `code` the UI can switch on.
 */
export class ApiError extends Error {
  constructor({ status = 0, code = 'UNKNOWN', message = 'Something went wrong.', details, requestId } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
  /** Field errors from a 422 as { field: message }. */
  get fieldErrors() {
    if (!Array.isArray(this.details)) return {};
    return Object.fromEntries(this.details.filter((d) => d.field).map((d) => [d.field, d.message]));
  }
}

const RETRYABLE_AUTH_CODES = new Set(['TOKEN_EXPIRED', 'UNAUTHENTICATED']);

export function createApiClient({ baseUrl, realm, clientType = 'native', tokenStore, onSessionExpired, timeoutMs = 20000 }) {
  let accessToken = null;
  let refreshing = null;
  const authBase = `/api/v1/auth/${realm}`;

  const qs = (query) => {
    if (!query) return '';
    const parts = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length))
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(Array.isArray(v) ? v.join(',') : v instanceof Date ? v.toISOString() : v)}`);
    return parts.length ? `?${parts.join('&')}` : '';
  };

  async function rawFetch(path, { method = 'GET', body, query, headers = {}, formData, timeout = timeoutMs, signal } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    if (signal) signal.addEventListener?.('abort', () => controller.abort());
    const h = { Accept: 'application/json', 'X-W2C-Client': clientType, ...headers };
    if (accessToken && !h.Authorization) h.Authorization = `Bearer ${accessToken}`;
    let payload;
    if (formData) payload = formData;
    else if (body !== undefined) {
      h['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    try {
      return await fetch(`${baseUrl}${path}${qs(query)}`, { method, headers: h, body: payload, signal: controller.signal, credentials: clientType === 'web' ? 'include' : 'omit' });
    } catch (err) {
      if (controller.signal.aborted && !signal?.aborted) throw new ApiError({ code: 'TIMEOUT', message: 'The request timed out. Check your connection and try again.' });
      if (signal?.aborted) throw new ApiError({ code: 'ABORTED', message: 'Request cancelled.' });
      throw new ApiError({ code: 'NETWORK', message: 'No internet connection. Please try again.' });
    } finally {
      clearTimeout(timer);
    }
  }

  async function parse(res) {
    if (res.status === 204) {
      await res.text().catch(() => {}); // drain the empty body so browsers don't report the request as cancelled
      return { body: null };
    }
    const type = res.headers.get('content-type') || '';
    if (!type.includes('application/json')) return { body: null, raw: res };
    const json = await res.json().catch(() => null);
    return { body: json };
  }

  async function refresh() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const refreshToken = clientType === 'native' ? await tokenStore?.getRefresh?.() : null;
      if (clientType === 'native' && !refreshToken) return false;
      const res = await rawFetch(`${authBase}/refresh`, { method: 'POST', body: clientType === 'native' ? { refreshToken } : {}, headers: { Authorization: '' } });
      const { body } = await parse(res);
      if (!res.ok || !body?.success) return false;
      accessToken = body.data.accessToken;
      if (clientType === 'native' && body.data.refreshToken) await tokenStore?.setRefresh?.(body.data.refreshToken);
      return body.data;
    })().finally(() => {
      setTimeout(() => (refreshing = null), 0);
    });
    return refreshing;
  }

  async function request(path, opts = {}, retried = false) {
    const res = await rawFetch(path, opts);
    if (opts.rawResponse && res.ok) return res;
    const { body } = await parse(res);
    if (res.ok) return opts.withMeta ? { data: body?.data, meta: body?.meta } : body?.data ?? null;
    const err = new ApiError({ status: res.status, ...(body?.error || {}), message: body?.error?.message || `Request failed (${res.status})` });
    if (res.status === 401 && !retried && !opts.skipAuthRetry && RETRYABLE_AUTH_CODES.has(err.code) && (accessToken || clientType === 'web')) {
      const refreshed = await refresh();
      if (refreshed) return request(path, opts, true);
      accessToken = null;
      onSessionExpired?.();
    } else if (res.status === 401 && ['SESSION_REVOKED', 'SESSION_EXPIRED', 'ACCOUNT_SUSPENDED'].includes(err.code)) {
      accessToken = null;
      onSessionExpired?.();
    }
    throw err;
  }

  return {
    get baseUrl() {
      return baseUrl;
    },
    setAccessToken(t) {
      accessToken = t;
    },
    getAccessToken: () => accessToken,
    /** Restores a session at app start. Returns { account } or null. */
    async restore() {
      const r = await refresh();
      return r ? { account: r.account } : null;
    },
    async logout() {
      try {
        const refreshToken = clientType === 'native' ? await tokenStore?.getRefresh?.() : undefined;
        await rawFetch(`${authBase}/logout`, { method: 'POST', body: clientType === 'native' ? { refreshToken } : {} });
      } catch {
        // offline logout still clears local state
      }
      accessToken = null;
      await tokenStore?.clear?.();
    },
    /** Stores tokens from a login response. */
    async acceptLogin(data) {
      accessToken = data.accessToken;
      if (clientType === 'native' && data.refreshToken) await tokenStore?.setRefresh?.(data.refreshToken);
    },
    get: (path, query, opts) => request(path, { ...opts, query }),
    list: (path, query, opts) => request(path, { ...opts, query, withMeta: true }),
    post: (path, body, opts) => request(path, { ...opts, method: 'POST', body: body ?? {} }),
    put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body: body ?? {} }),
    patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body: body ?? {} }),
    del: (path, body, opts) => request(path, { ...opts, method: 'DELETE', body }),
    upload: (path, formData, opts) => request(path, { ...opts, method: 'POST', formData, timeout: 90000 }),
    raw: (path, opts) => request(path, { ...opts, rawResponse: true }),
  };
}
