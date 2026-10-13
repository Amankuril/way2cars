import { unauthorized, forbidden, AppError } from '../core/errors.js';
import { verifyAccessToken } from '../modules/auth/token.service.js';
import { sessionModels } from '../modules/auth/session.model.js';
import { realmModels } from '../modules/auth/auth.service.js';
import { hasPermission } from '../modules/auth/permissions.js';

const ACCOUNT_FIELDS = {
  user: 'phone name status kyc profileCompleted',
  vendor: 'phone name businessName status kyc completedSteps',
  admin: 'email name role status',
};

/**
 * Authenticates a request for exactly one realm. The realm is fixed by the route, never by the
 * client: a vendor token presented to a user route fails audience verification.
 * Every request re-checks the session (revocation) and account status (suspension).
 */
export function authenticate(realm, { allowStatuses } = {}) {
  return async (req, _res, next) => {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return next(unauthorized());
    const claims = verifyAccessToken(token, realm);
    const [session, account] = await Promise.all([
      sessionModels[realm].findById(claims.sid).select('accountId revokedAt expiresAt').lean(),
      realmModels[realm].findById(claims.sub).select(ACCOUNT_FIELDS[realm]).lean(),
    ]);
    if (!session || session.revokedAt || session.expiresAt < new Date() || String(session.accountId) !== claims.sub) {
      return next(unauthorized('Session expired. Please sign in again.', 'SESSION_REVOKED'));
    }
    if (!account) return next(unauthorized());
    const blocked = realm === 'admin' ? account.status !== 'active' : ['suspended', 'deleted'].includes(account.status);
    if (blocked && !(allowStatuses || []).includes(account.status)) {
      return next(new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended. Please contact support.'));
    }
    req.auth = {
      realm,
      id: account._id,
      sessionId: claims.sid,
      role: account.role,
      label: account.email || account.phone,
      account,
    };
    next();
  };
}

/** Admin permission gate; use after authenticate('admin'). */
export const requirePermission = (...perms) => (req, _res, next) => {
  if (req.auth?.realm !== 'admin') return next(forbidden());
  if (!perms.every((p) => hasPermission(req.auth.role, p))) return next(forbidden());
  next();
};

/** Vendor approval gate for actions that affect the live marketplace. */
export const requireApprovedVendor = (req, _res, next) => {
  if (req.auth?.realm !== 'vendor' || req.auth.account.status !== 'approved') {
    return next(forbidden('Your host account must be approved before you can do this.', 'VENDOR_NOT_APPROVED'));
  }
  next();
};
