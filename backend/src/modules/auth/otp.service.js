import { env } from '../../config/env.js';
import { hmac, randomDigits, safeEqual } from '../../core/crypto.js';
import { tooMany, badRequest, unavailable } from '../../core/errors.js';
import { normalizeIndianMobile, maskPhone } from '../../core/phone.js';
import { logger } from '../../core/logger.js';
import { sendSms } from '../../integrations/sms.js';
import { OtpChallenge } from './otp.model.js';

export const STATIC_OTP = '1234';

// Normalised once at startup; never exposed to clients or logged.
const dummyNumbers = new Set(env.OTP_DUMMY_NUMBERS.map(normalizeIndianMobile).filter(Boolean));

export function bypassStatus() {
  return { globalBypass: env.OTP_BYPASS_ENABLED, dummyNumberCount: dummyNumbers.size };
}

/**
 * Decides how an OTP is produced for a number:
 *  - number in OTP_DUMMY_NUMBERS → static 1234, in every environment
 *  - OTP_BYPASS_ENABLED=true     → static 1234 for everyone
 *  - otherwise                    → random code delivered by SMS India Hub
 */
export function decideOtpMode(phone, { bypassEnabled, dummyNumbers: dummies }) {
  if (dummies.has(phone)) return 'static'; // deliberately independent of NODE_ENV
  if (bypassEnabled) return 'static';
  return 'sms';
}
export const otpModeFor = (phone) => decideOtpMode(phone, { bypassEnabled: env.OTP_BYPASS_ENABLED, dummyNumbers });

const hashCode = (phone, realm, code) => hmac(env.OTP_HMAC_SECRET, `${realm}:${phone}:${code}`);
const HOUR = 3600_000;

/** Issues an OTP. Same response shape for every number (no account enumeration). */
export async function requestOtp({ phone, realm, ip }) {
  const now = Date.now();
  const [latest, phoneCount, ipCount] = await Promise.all([
    OtpChallenge.findOne({ phone, realm }).sort({ createdAt: -1 }).select('createdAt').lean(),
    OtpChallenge.countDocuments({ phone, realm, createdAt: { $gt: new Date(now - HOUR) } }),
    OtpChallenge.countDocuments({ ip, createdAt: { $gt: new Date(now - HOUR) } }),
  ]);
  if (latest) {
    const wait = Math.ceil((latest.createdAt.getTime() + env.OTP_RESEND_COOLDOWN_SECONDS * 1000 - now) / 1000);
    if (wait > 0) throw tooMany(`Please wait ${wait}s before requesting another code.`, wait);
  }
  if (phoneCount >= env.OTP_MAX_PER_PHONE_PER_HOUR)
    throw tooMany('Too many codes requested for this number. Try again in an hour.', 3600);
  if (ipCount >= env.OTP_MAX_PER_IP_PER_HOUR) throw tooMany('Too many requests from this network. Try again later.', 3600);

  const mode = otpModeFor(phone);
  const code = mode === 'static' ? STATIC_OTP : randomDigits(env.OTP_LENGTH);

  // Invalidate older outstanding codes so only the newest works.
  await OtpChallenge.updateMany({ phone, realm, consumedAt: null }, { $set: { consumedAt: new Date(now) } });
  const challenge = await OtpChallenge.create({
    phone,
    realm,
    codeHash: hashCode(phone, realm, code),
    mode,
    ip,
    expiresAt: new Date(now + env.OTP_TTL_SECONDS * 1000),
    purgeAt: new Date(now + 24 * HOUR),
    deliveryStatus: mode === 'static' ? 'skipped' : 'sent',
  });

  if (mode === 'sms') {
    const result = await sendSms(phone, 'otp', { otp: code, minutes: Math.round(env.OTP_TTL_SECONDS / 60) });
    if (result.status !== 'sent') {
      await OtpChallenge.updateOne({ _id: challenge._id }, { $set: { deliveryStatus: 'failed', consumedAt: new Date() } });
      throw unavailable('We could not send the verification code right now. Please try again shortly.', 'OTP_DELIVERY_FAILED');
    }
    await OtpChallenge.updateOne({ _id: challenge._id }, { $set: { providerRef: result.providerRef } });
  } else {
    logger.warn({ realm, phone: maskPhone(phone), event: 'otp.static_issued' }, 'static OTP issued (bypass/dummy number)');
  }

  return { expiresInSeconds: env.OTP_TTL_SECONDS, resendAfterSeconds: env.OTP_RESEND_COOLDOWN_SECONDS };
}

/** Verifies and consumes an OTP. Throws a generic error for wrong/expired/exhausted codes. */
export async function verifyOtp({ phone, realm, code }) {
  if (!/^\d{4,8}$/.test(String(code || ''))) throw badRequest('Enter the code sent to your phone.', undefined, 'OTP_INVALID');
  const now = new Date();
  // Atomically claim an attempt on the newest live challenge.
  const challenge = await OtpChallenge.findOneAndUpdate(
    { phone, realm, consumedAt: null, expiresAt: { $gt: now }, attempts: { $lt: env.OTP_MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { sort: { createdAt: -1 }, new: true },
  );
  if (!challenge) throw badRequest('This code has expired or too many attempts were made. Request a new code.', undefined, 'OTP_EXPIRED');

  if (!safeEqual(challenge.codeHash, hashCode(phone, realm, String(code)))) {
    const left = env.OTP_MAX_ATTEMPTS - challenge.attempts;
    if (left <= 0) await OtpChallenge.updateOne({ _id: challenge._id }, { $set: { consumedAt: now } });
    throw badRequest(
      left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Incorrect code. Request a new code.',
      { attemptsLeft: Math.max(left, 0) },
      'OTP_INCORRECT',
    );
  }
  // Single use: only one concurrent verifier can flip consumedAt.
  const claimed = await OtpChallenge.updateOne({ _id: challenge._id, consumedAt: null }, { $set: { consumedAt: now } });
  if (claimed.modifiedCount !== 1) throw badRequest('This code has already been used.', undefined, 'OTP_EXPIRED');
  return { mode: challenge.mode };
}
