import { env } from '../config/env.js';
import { logger } from '../core/logger.js';
import { maskPhone } from '../core/phone.js';
import { fetchWithRetry } from './http.js';

/**
 * SMS India Hub — the ONLY place that talks to the SMS provider.
 * Transactional REST API: POST {SMSINDIAHUB_API_URL} with JSON body; ErrorCode "000" = accepted.
 * Indian DLT rules: message text must match the registered template exactly; the template id is
 * passed per message type and the principal entity id (PEId) per account.
 */

const TEMPLATES = {
  otp: { id: () => env.SMS_TEMPLATE_OTP, text: (d) => `${d.otp} is your WAY2CARS verification code. It is valid for ${d.minutes} minutes. Do not share it with anyone.` },
  booking_confirmed: { id: () => env.SMS_TEMPLATE_BOOKING_CONFIRMED, text: (d) => `Your WAY2CARS booking ${d.ref} for ${d.vehicle} is confirmed. Pickup: ${d.start}. Return: ${d.end}.` },
  payment: { id: () => env.SMS_TEMPLATE_PAYMENT, text: (d) => `WAY2CARS: payment of Rs ${d.amount} for booking ${d.ref} was ${d.status}.` },
  reminder: { id: () => env.SMS_TEMPLATE_REMINDER, text: (d) => `WAY2CARS reminder: your ${d.kind} for booking ${d.ref} is at ${d.at}.` },
  vendor_booking: { id: () => env.SMS_TEMPLATE_VENDOR_BOOKING, text: (d) => `WAY2CARS: new booking request ${d.ref} for ${d.vehicle} from ${d.start} to ${d.end}. Please respond in the host app.` },
  generic: { id: () => env.SMS_TEMPLATE_GENERIC, text: (d) => d.text },
};

export const smsConfigured = () => Boolean(env.SMS_ENABLED && env.SMSINDIAHUB_API_KEY && env.SMSINDIAHUB_SENDER_ID);

/**
 * Sends a templated SMS. Returns { status: 'sent'|'skipped'|'failed', providerRef?, error? }.
 * Never throws for provider failures — callers decide how to surface them.
 */
export async function sendSms(phone10, templateKey, data, { retries = 1 } = {}) {
  const tpl = TEMPLATES[templateKey];
  if (!tpl) throw new Error(`Unknown SMS template ${templateKey}`);
  if (!smsConfigured()) {
    logger.info({ to: maskPhone(phone10), template: templateKey }, 'sms skipped (provider not configured)');
    return { status: 'skipped' };
  }
  const body = {
    'Account.APIKey': env.SMSINDIAHUB_API_KEY,
    SenderId: env.SMSINDIAHUB_SENDER_ID,
    Channel: env.SMSINDIAHUB_CHANNEL,
    DCS: '0',
    FlashSMS: '0',
    Number: `91${phone10}`,
    Route: env.SMSINDIAHUB_ROUTE,
    Message: tpl.text(data),
  };
  if (env.SMSINDIAHUB_PEID) body.PEId = env.SMSINDIAHUB_PEID;
  const templateId = tpl.id();
  if (templateId) body.TemplateId = templateId;

  try {
    // Retries only on network failure/5xx — a 200 with an error code is not retried (could double-send).
    const res = await fetchWithRetry(
      env.SMSINDIAHUB_API_URL,
      { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) },
      { timeoutMs: env.SMSINDIAHUB_TIMEOUT_MS, retries },
    );
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    if (res.ok && json && String(json.ErrorCode) === '000') {
      const providerRef = json.JobId || json.MessageData?.[0]?.MessageId;
      logger.info({ to: maskPhone(phone10), template: templateKey, providerRef }, 'sms sent');
      return { status: 'sent', providerRef };
    }
    const error = json?.ErrorMessage || `HTTP ${res.status}`;
    logger.error({ to: maskPhone(phone10), template: templateKey, providerCode: json?.ErrorCode, error }, 'sms rejected by provider');
    return { status: 'failed', error };
  } catch (err) {
    logger.error({ to: maskPhone(phone10), template: templateKey, err: err.message }, 'sms request failed');
    return { status: 'failed', error: err.message };
  }
}

/** Delivery report lookup by provider job id. */
export async function getDeliveryStatus(jobId) {
  if (!smsConfigured()) return null;
  const url = new URL(env.SMSINDIAHUB_DELIVERY_URL);
  url.searchParams.set('APIKey', env.SMSINDIAHUB_API_KEY);
  url.searchParams.set('jobid', jobId);
  const res = await fetchWithRetry(url, {}, { timeoutMs: env.SMSINDIAHUB_TIMEOUT_MS, retries: 1 });
  return res.ok ? res.json().catch(() => null) : null;
}
