import { env } from '../config/env.js';
import { logger } from '../core/logger.js';
import { maskPhone } from '../core/phone.js';

/**
 * WhatsApp Cloud API (Meta) — the only code that talks to WhatsApp. Business-initiated messages must
 * use an approved template, so the booking confirmation is a template whose body variables are filled
 * in order. Disabled cleanly (status "skipped") until the credentials are configured.
 */

export const whatsappConfigured = () => Boolean(env.WHATSAPP_ENABLED && env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_BOOKING_TEMPLATE);

// WhatsApp rejects template parameters with newlines, tabs or 4+ spaces in a row.
const clean = (v) => String(v ?? '').replace(/[\n\t]+/g, ' · ').replace(/ {4,}/g, '   ').slice(0, 900);

/** Sends the booking template to an Indian mobile. Returns { status: 'sent'|'skipped'|'failed', providerRef?, error? }. */
export async function sendWhatsappTemplate(phone10, params, { template = env.WHATSAPP_BOOKING_TEMPLATE } = {}) {
  if (!whatsappConfigured()) return { status: 'skipped' };
  const to = `91${String(phone10).replace(/\D/g, '').slice(-10)}`;
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: { name: template, language: { code: env.WHATSAPP_TEMPLATE_LANG }, components: [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: clean(p) || '-' })) }] },
  };
  try {
    const res = await fetch(`https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = json?.error?.message || `HTTP ${res.status}`;
      logger.error({ to: maskPhone(phone10), error }, 'whatsapp message rejected');
      return { status: 'failed', error };
    }
    return { status: 'sent', providerRef: json?.messages?.[0]?.id };
  } catch (err) {
    logger.error({ to: maskPhone(phone10), err: err.message }, 'whatsapp request failed');
    return { status: 'failed', error: err.message };
  }
}

/** wa.me link with the text pre-filled — the manual fallback staff can send from their own WhatsApp. */
export const whatsappLink = (phone10, text) => `https://wa.me/91${String(phone10).replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(text)}`;
