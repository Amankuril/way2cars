import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../core/logger.js';

/** SMTP email — the ONLY module that sends email. No-ops (logged) when SMTP is not configured. */
let transport;
export const emailConfigured = () => Boolean(env.SMTP_HOST);

function getTransport() {
  if (!emailConfigured()) return null;
  transport ||= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transport;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Renders a minimal branded transactional email. `lines` are plain text paragraphs. */
export function renderEmail({ heading, lines = [], cta }) {
  const paras = lines.map((l) => `<p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:22px">${escapeHtml(l)}</p>`).join('');
  const button = cta ? `<p style="margin:20px 0"><a href="${escapeHtml(cta.url)}" style="background:#1875B9;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">${escapeHtml(cta.label)}</a></p>` : '';
  return `<!doctype html><html><body style="margin:0;background:#F5F8FA;font-family:Arial,Helvetica,sans-serif"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px"><table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:28px"><tr><td><div style="font-weight:800;font-size:20px;color:#1D2C32;letter-spacing:.5px">WAY2CARS</div><h1 style="font-size:20px;color:#1D2C32;margin:20px 0 12px">${escapeHtml(heading)}</h1>${paras}${button}<p style="margin:24px 0 0;color:#94A3B8;font-size:12px">WAY2CARS Technology Pvt Ltd</p></td></tr></table></td></tr></table></body></html>`;
}

export async function sendEmail({ to, subject, heading, lines, cta, attachments }) {
  const t = getTransport();
  if (!t || !to) return { status: 'skipped' };
  try {
    const info = await t.sendMail({ from: env.EMAIL_FROM, to, subject, text: [heading, ...(lines || [])].join('\n\n'), html: renderEmail({ heading, lines, cta }), attachments });
    return { status: 'sent', providerRef: info.messageId };
  } catch (err) {
    logger.error({ err: err.message, subject }, 'email send failed');
    return { status: 'failed', error: err.message };
  }
}
