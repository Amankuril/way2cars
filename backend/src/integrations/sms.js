import { env } from '../config/env.js';
import { logger } from '../core/logger.js';
import { maskPhone } from '../core/phone.js';

/**
 * SMS India Hub — the ONLY place that talks to the SMS provider, and it is used ONLY for login
 * OTPs (bookings, payments and reminders go out by push, email and in-app).
 * Endpoint and parameters follow the SMS India Hub "vendorsms" push API. Indian DLT rules: the
 * text must match the registered template exactly, and the sender ID must be the DLT header
 * linked to that template.
 */

const PUSH_URL = 'https://cloud.smsindiahub.in/vendorsms/pushsms.aspx';

export const smsConfigured = () => Boolean(env.SMS_ENABLED && env.SMS_INDIA_HUB_API_KEY && env.SMS_INDIA_HUB_SENDER_ID);

export const buildOtpMessage = (otp) => env.SMS_INDIA_HUB_OTP_TEMPLATE.split('{otp}').join(String(otp));

/**
 * SMS India Hub answers HTTP 200 for failures too. Success is JSON `{"ErrorCode":"000", …}`;
 * failures come as JSON with another code or as plain text such as "Failed#Parameter Missing".
 */
export function parseResponse(status, text) {
  const body = String(text || '').trim();
  let json = null;
  try {
    json = JSON.parse(body);
  } catch {
    // plain text
  }
  if (json && typeof json === 'object' && 'ErrorCode' in json) {
    const code = String(json.ErrorCode);
    if (code === '000') return { ok: true, providerRef: json.JobId || json.MessageData?.[0]?.MessageId };
    return { ok: false, code, reason: json.ErrorMessage || body };
  }
  if (status < 200 || status >= 300) return { ok: false, code: `HTTP_${status}`, reason: body };
  if (!body || /fail|error|invalid|missing|denied|insufficient|blocked/i.test(body)) return { ok: false, code: 'TEXT', reason: body || 'empty response' };
  return { ok: true, unverified: true }; // unrecognised but not an error: don't block the user
}

/**
 * Sends a login OTP. Returns { status: 'sent'|'skipped'|'failed', providerRef?, error? } and never
 * throws — the OTP service decides what the user sees. Not retried: a retry could deliver two codes.
 */
export async function sendOtpSms(phone10, otp) {
  if (!smsConfigured()) {
    logger.info({ to: maskPhone(phone10) }, 'otp sms skipped (provider not configured)');
    return { status: 'skipped' };
  }
  // HTTPS only: the API key travels as a query parameter.
  const url = new URL(PUSH_URL);
  url.searchParams.set('APIKey', env.SMS_INDIA_HUB_API_KEY);
  url.searchParams.set('sid', env.SMS_INDIA_HUB_SENDER_ID);
  url.searchParams.set('msisdn', `91${String(phone10).replace(/\D/g, '').slice(-10)}`);
  url.searchParams.set('msg', buildOtpMessage(otp));
  url.searchParams.set('gwid', '2');
  url.searchParams.set('fl', '0');
  if (env.SMS_INDIA_HUB_USERNAME) url.searchParams.set('uname', env.SMS_INDIA_HUB_USERNAME);
  if (env.SMS_INDIA_HUB_DLT_TEMPLATE_ID) url.searchParams.set('DLT_TE_ID', env.SMS_INDIA_HUB_DLT_TEMPLATE_ID);

  let status;
  let text;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(env.SMS_INDIA_HUB_TIMEOUT_MS) });
    status = res.status;
    text = await res.text();
  } catch (err) {
    logger.error({ to: maskPhone(phone10), err: err.message }, 'otp sms request failed');
    return { status: 'failed', error: err.message };
  }
  const result = parseResponse(status, text);
  if (!result.ok) {
    const hint = result.code === '006' ? ' (DLT template mismatch: the text must match SMS_INDIA_HUB_OTP_TEMPLATE exactly and the sender ID must be the linked DLT header)' : '';
    logger.error({ to: maskPhone(phone10), providerCode: result.code, error: result.reason }, `otp sms rejected by provider${hint}`);
    return { status: 'failed', error: result.reason };
  }
  logger.info({ to: maskPhone(phone10), providerRef: result.providerRef, unverified: result.unverified || undefined }, 'otp sms sent');
  return { status: 'sent', providerRef: result.providerRef };
}
