import { env } from '../config/env.js';
import { logger } from '../core/logger.js';
import { maskPhone } from '../core/phone.js';

/**
 * Textora SMS (POST /sms/india/send) — the ONLY place that talks to the SMS provider. Used for login
 * OTPs and for the booking confirmation (its own DLT template); everything else goes out by push,
 * email, WhatsApp and in-app. Indian DLT rules: the text must match the registered template exactly,
 * and the sender ID must be the DLT header linked to that template.
 */

export const smsConfigured = () => Boolean(env.SMS_ENABLED && env.TEXTORA_SMS_AUTHKEY && env.TEXTORA_SMS_FROM && env.TEXTORA_SMS_PE_ID);

export const buildOtpMessage = (otp) => env.TEXTORA_SMS_OTP_TEMPLATE.split('{otp}').join(String(otp));

/**
 * Textora answers JSON such as `{"message":"SMS sent successfully.","message_id":"…","statusCode":200,"success":true}`
 * and `{"message":"Invalid API key","message_id":"","statusCode":401,"success":false}`. Only an explicit
 * `success: true` counts as sent: this is what the OTP fallback relies on.
 * It means "accepted by the provider", not "delivered to the handset".
 */
export function parseResponse(status, text) {
  const body = String(text || '').trim();
  let json = null;
  try {
    json = JSON.parse(body);
  } catch {
    // not JSON (gateway error page, etc.)
  }
  if (status >= 200 && status < 300 && json?.success === true) return { ok: true, providerRef: json.message_id || undefined };
  return { ok: false, code: String(json?.statusCode ?? `HTTP_${status}`), reason: String(json?.message || body || 'empty response').slice(0, 300) };
}

/** One DLT message. Returns { status: 'sent'|'failed', providerRef?, error? } and never throws. Not retried: a retry could deliver two codes. */
async function send(phone10, content, templateId, label) {
  const to = maskPhone(phone10);
  try {
    const res = await fetch(env.TEXTORA_SMS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authkey: env.TEXTORA_SMS_AUTHKEY,
        to: String(phone10).replace(/\D/g, '').slice(-10), // 10 digits, no country code on this endpoint
        content,
        from: env.TEXTORA_SMS_FROM,
        PE_ID: env.TEXTORA_SMS_PE_ID,
        Template_ID: templateId,
      }),
      signal: AbortSignal.timeout(env.TEXTORA_SMS_TIMEOUT_MS),
    });
    const result = parseResponse(res.status, await res.text());
    if (!result.ok) {
      logger.error({ to, providerCode: result.code, error: result.reason }, `${label} sms rejected by provider`);
      return { status: 'failed', error: result.reason };
    }
    logger.info({ to, providerRef: result.providerRef }, `${label} sms accepted by provider`);
    return { status: 'sent', providerRef: result.providerRef };
  } catch (err) {
    logger.error({ to, err: err.message }, `${label} sms request failed`);
    return { status: 'failed', error: err.message };
  }
}

/** Sends a login OTP. Returns { status: 'sent'|'skipped'|'failed', providerRef?, error? } and never throws; the OTP service decides what the user sees. */
export async function sendOtpSms(phone10, otp) {
  if (!smsConfigured() || !env.TEXTORA_SMS_OTP_TEMPLATE_ID) {
    logger.info({ to: maskPhone(phone10) }, 'otp sms skipped (provider not configured)');
    return { status: 'skipped' };
  }
  return send(phone10, buildOtpMessage(otp), env.TEXTORA_SMS_OTP_TEMPLATE_ID, 'otp');
}

export const bookingSmsConfigured = () => smsConfigured() && Boolean(env.TEXTORA_SMS_BOOKING_TEMPLATE && env.TEXTORA_SMS_BOOKING_TEMPLATE_ID);

/** Fills the booking DLT template. Values are trimmed so the text stays within the registered variable lengths. */
export function buildBookingSms(vars) {
  return Object.entries(vars).reduce((text, [k, v]) => text.split(`{${k}}`).join(String(v ?? '').slice(0, 30)), env.TEXTORA_SMS_BOOKING_TEMPLATE || '');
}

/** Booking confirmation SMS. Same result shape as sendOtpSms; never throws. */
export async function sendBookingSms(phone10, vars) {
  if (!bookingSmsConfigured()) return { status: 'skipped' };
  return send(phone10, buildBookingSms(vars), env.TEXTORA_SMS_BOOKING_TEMPLATE_ID, 'booking');
}
