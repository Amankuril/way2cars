import { env } from '../config/env.js';
import { logger } from '../core/logger.js';
import { maskPhone } from '../core/phone.js';

/**
 * WhatsApp — the only code that talks to a WhatsApp provider. Business-initiated messages must use an
 * approved template, so the booking confirmation is a template whose body variables are filled in order.
 *  - textora (default): BUZWAP / api.textorasms.com — authkey + business account id in the JSON body.
 *  - meta: WhatsApp Cloud API (graph.facebook.com) with a bearer token.
 * Disabled cleanly (status "skipped") until configured.
 */

const PROVIDERS = {
  textora: {
    ready: () => Boolean(env.TEXTORA_AUTHKEY && env.TEXTORA_BUSINESS_ACCOUNT_ID && env.TEXTORA_FROM),
    request: (body) => ({
      url: env.TEXTORA_API_URL,
      headers: { 'Content-Type': 'application/json' },
      body: { from: env.TEXTORA_FROM, authkey: env.TEXTORA_AUTHKEY, bussiness_account_id: env.TEXTORA_BUSINESS_ACCOUNT_ID, ...body },
    }),
  },
  meta: {
    ready: () => Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID),
    request: (body) => ({
      url: `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body,
    }),
  },
};

const providerReady = () => Boolean(env.WHATSAPP_ENABLED && PROVIDERS[env.WHATSAPP_PROVIDER]?.ready());
export const whatsappConfigured = () => providerReady() && Boolean(env.WHATSAPP_BOOKING_TEMPLATE);
export const whatsappOtpConfigured = () => providerReady() && Boolean(env.WHATSAPP_OTP_TEMPLATE);
export const whatsappUpdatesConfigured = () => providerReady() && Boolean(env.WHATSAPP_UPDATE_TEMPLATE);

// WhatsApp rejects template parameters with newlines, tabs or 4+ spaces in a row.
const clean = (v) => String(v ?? '').replace(/[\n\t]+/g, ' · ').replace(/ {4,}/g, '   ').slice(0, 900);

/**
 * Provider answers vary: treat HTTP errors, `status: false/"error"/"failed"` and an `error` field as failures.
 * Exported for tests.
 */
export function parseWhatsappResponse(httpStatus, json) {
  const failed = httpStatus >= 400 || json?.error || json?.status === false || /^(error|failed|failure)$/i.test(String(json?.status ?? '')) || json?.success === false;
  if (failed) return { ok: false, error: json?.error?.message || json?.error || json?.message || `HTTP ${httpStatus}` };
  return { ok: true, providerRef: json?.messages?.[0]?.id || json?.message_id || json?.messageId || json?.data?.id || json?.id };
}

/** Sends a template to an Indian mobile. Returns { status: 'sent'|'skipped'|'failed', providerRef?, error? }. Never throws. */
export async function sendWhatsappTemplate(phone10, params, { template = env.WHATSAPP_BOOKING_TEMPLATE, buttonText } = {}) {
  if (!providerReady() || !template) return { status: 'skipped' };
  const to = `91${String(phone10).replace(/\D/g, '').slice(-10)}`;
  const req = PROVIDERS[env.WHATSAPP_PROVIDER].request({
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: template,
      language: { code: env.WHATSAPP_TEMPLATE_LANG },
      components: [
        { type: 'body', parameters: params.map((p) => ({ type: 'text', text: clean(p) || '-' })) },
        // Authentication templates: the "Copy code" button carries the code too.
        ...(buttonText ? [{ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: buttonText }] }] : []),
      ],
    },
  });
  try {
    const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body), signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { message: text.slice(0, 300) };
    }
    const r = parseWhatsappResponse(res.status, json);
    if (!r.ok) {
      logger.error({ to: maskPhone(phone10), provider: env.WHATSAPP_PROVIDER, error: r.error }, 'whatsapp message rejected');
      return { status: 'failed', error: String(r.error).slice(0, 300) };
    }
    return { status: 'sent', providerRef: r.providerRef ? String(r.providerRef) : undefined };
  } catch (err) {
    logger.error({ to: maskPhone(phone10), err: err.message }, 'whatsapp request failed');
    return { status: 'failed', error: err.message };
  }
}

/** Login OTP over WhatsApp. Never logs the code. */
export const sendOtpWhatsapp = (phone10, code) => sendWhatsappTemplate(phone10, [code], { template: env.WHATSAPP_OTP_TEMPLATE, buttonText: env.WHATSAPP_OTP_BUTTON ? code : undefined });

/** wa.me link with the text pre-filled — the manual fallback staff can send from their own WhatsApp. */
export const whatsappLink = (phone10, text) => `https://wa.me/91${String(phone10).replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(text)}`;
