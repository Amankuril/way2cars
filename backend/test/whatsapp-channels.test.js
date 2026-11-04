import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// WhatsApp OTP first, SMS as fallback; booking updates on WhatsApp (Textora / BUZWAP).
vi.hoisted(() => {
  Object.assign(process.env, {
    WHATSAPP_ENABLED: 'true', WHATSAPP_PROVIDER: 'textora', TEXTORA_FROM: 'BUZWAP', TEXTORA_AUTHKEY: 'k', TEXTORA_BUSINESS_ACCOUNT_ID: '9180',
    WHATSAPP_OTP_TEMPLATE: 'login_otp', OTP_CHANNELS: 'whatsapp,sms', WHATSAPP_UPDATE_TEMPLATE: 'booking_update', WHATSAPP_UPDATE_PARAMS: 'name,message',
    SMS_ENABLED: 'true', TEXTORA_SMS_AUTHKEY: 'smskey', TEXTORA_SMS_FROM: 'BTMSJM', TEXTORA_SMS_PE_ID: 'pe1', TEXTORA_SMS_OTP_TEMPLATE_ID: 'tpl1',
  });
});

const { api, useDb } = await import('./helpers.js');
const { OtpChallenge } = await import('../src/modules/auth/otp.model.js');
const { User } = await import('../src/modules/users/user.model.js');
const { notify } = await import('../src/modules/notifications/notification.service.js');
const { Notification } = await import('../src/modules/notifications/notification.model.js');

useDb();

const calls = [];
let whatsappFails = false;
const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = vi.fn(async (url, opts) => {
    const u = String(url);
    if (u.includes('textorasms.com/sms/')) {
      calls.push({ kind: 'sms', body: JSON.parse(opts.body) });
      return new Response(JSON.stringify({ message: 'SMS sent successfully.', message_id: 'sms1', statusCode: 200, success: true }), { status: 200 });
    }
    if (u.includes('textorasms.com/whatsapp/')) {
      const body = JSON.parse(opts.body);
      calls.push({ kind: 'whatsapp', body });
      return whatsappFails
        ? new Response(JSON.stringify({ message: 'WhatsApp Configuration is inactive.', success: false }), { status: 401 })
        : new Response(JSON.stringify({ success: true, message_id: 'wa1' }), { status: 200 });
    }
    return realFetch(url, opts);
  });
});
afterAll(() => { globalThis.fetch = realFetch; });

describe('login OTP over WhatsApp', () => {
  it('sends the code with the authentication template (body + copy-code button)', async () => {
    calls.length = 0;
    await api().post('/api/v1/auth/user/otp/request').send({ phone: '9811122233' }).expect(200);
    expect(calls.map((c) => c.kind)).toEqual(['whatsapp']);
    const t = calls[0].body.template;
    expect(t.name).toBe('login_otp');
    const code = t.components[0].parameters[0].text;
    expect(code).toMatch(/^\d{6}$/);
    expect(t.components[1]).toMatchObject({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] });
    expect((await OtpChallenge.findOne({ phone: '9811122233' }).lean()).channel).toBe('whatsapp');
    // The code that came on WhatsApp signs the user in.
    const v = await api().post('/api/v1/auth/user/otp/verify').set('X-W2C-Client', 'native').send({ phone: '9811122233', code });
    expect(v.status).toBe(200);
  });

  it('falls back to SMS when WhatsApp fails', async () => {
    calls.length = 0;
    whatsappFails = true;
    await api().post('/api/v1/auth/vendor/otp/request').send({ phone: '9811122244' }).expect(200);
    whatsappFails = false;
    expect(calls.map((c) => c.kind)).toEqual(['whatsapp', 'sms']);
    const sms = calls[1].body;
    expect(sms).toMatchObject({ authkey: 'smskey', to: '9811122244', from: 'BTMSJM', PE_ID: 'pe1', Template_ID: 'tpl1' });
    expect(sms.content).toMatch(/^Your OTP is \d{6}\. Do not share it\. - BITMISRI TECHNOLOGIES PRIVATE LIMITED$/);
    expect((await OtpChallenge.findOne({ phone: '9811122244' }).lean()).channel).toBe('sms');
  });
});

describe('updates over WhatsApp', () => {
  it('sends transactional updates with the update template, respects the opt-out, never sends promotions', async () => {
    const u = await User.create({ phone: '9811122255', name: 'Neha', referralCode: 'W2CWA0001' });
    calls.length = 0;
    await notify('refund.processed', { realm: 'user', id: u._id }, { amountPaise: 50000, ref: 'W2CTEST', bookingId: u._id });
    expect(calls).toHaveLength(1);
    expect(calls[0].body.template.name).toBe('booking_update');
    expect(calls[0].body.template.components[0].parameters.map((p) => p.text)).toEqual(['Neha', expect.stringMatching(/₹500\.00 has been refunded for booking W2CTEST/)]);
    expect((await Notification.findOne({ 'recipient.id': u._id }).lean()).channels.whatsapp).toBe('sent');
    calls.length = 0;
    await notify('promo.broadcast', { realm: 'user', id: u._id }, { title: 'Sale', body: '20% off' });
    expect(calls).toHaveLength(0);
    await User.updateOne({ _id: u._id }, { $set: { 'notificationPrefs.whatsapp': false } });
    await notify('payment.succeeded', { realm: 'user', id: u._id }, { amountPaise: 100, ref: 'W2CTEST2', bookingId: u._id });
    expect(calls).toHaveLength(0);
  });
});
