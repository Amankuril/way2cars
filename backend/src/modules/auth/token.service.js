import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { randomToken, sha256 } from '../../core/crypto.js';
import { unauthorized } from '../../core/errors.js';
import { sessionModels } from './session.model.js';

const ISSUER = 'way2cars';
const ROTATION_GRACE_MS = 20_000; // tolerate parallel refreshes from several tabs

export const refreshCookieName = (realm) => `w2c_${realm}_rt`;
export const refreshCookiePath = (realm) => `/api/v1/auth/${realm}`;

export function signAccessToken({ realm, accountId, sessionId, extra = {} }) {
  return jwt.sign({ ...extra, realm, sid: String(sessionId) }, env.JWT_ACCESS_SECRET, {
    subject: String(accountId),
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
    issuer: ISSUER,
    audience: realm,
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token, realm) {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: ISSUER, audience: realm, algorithms: ['HS256'] });
  } catch (err) {
    throw unauthorized(err.name === 'TokenExpiredError' ? 'Session expired.' : 'Invalid session.', err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'UNAUTHENTICATED');
  }
}

/** Short-lived token proving password success while MFA is pending. */
export const signMfaToken = (adminId) =>
  jwt.sign({ purpose: 'mfa' }, env.JWT_ACCESS_SECRET, { subject: String(adminId), expiresIn: 300, issuer: ISSUER, audience: 'admin-mfa' });
export function verifyMfaToken(token) {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: ISSUER, audience: 'admin-mfa', algorithms: ['HS256'] }).sub;
  } catch {
    throw unauthorized('Sign-in step expired. Please start again.', 'MFA_EXPIRED');
  }
}

const refreshTtlMs = (realm) =>
  realm === 'admin' ? env.ADMIN_REFRESH_TTL_HOURS * 3600_000 : env.USER_REFRESH_TTL_DAYS * 86400_000;

export async function createSession({ realm, accountId, ip, userAgent }) {
  const secret = randomToken();
  const session = await sessionModels[realm].create({
    accountId,
    tokenHash: sha256(secret),
    expiresAt: new Date(Date.now() + refreshTtlMs(realm)),
    ip,
    userAgent: userAgent?.slice(0, 300),
    lastUsedAt: new Date(),
  });
  return { session, refreshToken: `${session._id}.${secret}` };
}

/**
 * Rotates a refresh token. Presenting an already-rotated token outside the grace window is
 * treated as theft: the session is revoked.
 */
export async function rotateSession(realm, presented) {
  const [id, secret] = String(presented || '').split('.');
  if (!id || !secret || !/^[a-f0-9]{24}$/.test(id)) throw unauthorized();
  const Model = sessionModels[realm];
  const session = await Model.findById(id);
  if (!session || session.revokedAt || session.expiresAt < new Date()) throw unauthorized('Session expired. Please sign in again.', 'SESSION_EXPIRED');
  const hash = sha256(secret);

  if (hash === session.tokenHash) {
    const next = randomToken();
    const updated = await Model.findOneAndUpdate(
      { _id: session._id, tokenHash: hash, revokedAt: null },
      { $set: { prevTokenHash: hash, tokenHash: sha256(next), rotatedAt: new Date(), lastUsedAt: new Date() } },
      { new: true },
    );
    if (!updated) return rotateSession(realm, presented); // lost a race with a parallel refresh
    return { session: updated, refreshToken: `${session._id}.${next}`, rotated: true };
  }
  if (hash === session.prevTokenHash && session.rotatedAt && Date.now() - session.rotatedAt.getTime() < ROTATION_GRACE_MS) {
    return { session, refreshToken: null, rotated: false }; // a sibling request already rotated
  }
  await Model.updateOne({ _id: session._id }, { $set: { revokedAt: new Date(), revokedReason: 'refresh_token_reuse' } });
  throw unauthorized('Session expired. Please sign in again.', 'SESSION_REVOKED');
}

export async function revokeSession(realm, sessionId, reason = 'logout') {
  await sessionModels[realm].updateOne({ _id: sessionId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } });
}

export async function revokeAllSessions(realm, accountId, reason) {
  await sessionModels[realm].updateMany({ accountId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } });
}

export function setRefreshCookie(res, realm, refreshToken, expiresAt) {
  res.cookie(refreshCookieName(realm), refreshToken, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'strict',
    path: refreshCookiePath(realm),
    expires: expiresAt,
  });
}

export function clearRefreshCookie(res, realm) {
  res.clearCookie(refreshCookieName(realm), { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'strict', path: refreshCookiePath(realm) });
}
