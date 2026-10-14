import { describe, it, expect } from 'vitest';
import { parseResponse, buildOtpMessage } from '../src/integrations/sms.js';

describe('SMS India Hub response parsing', () => {
  it('accepts ErrorCode 000 and keeps the job id', () => {
    expect(parseResponse(200, '{"ErrorCode":"000","ErrorMessage":"Done","JobId":"123"}')).toEqual({ ok: true, providerRef: '123' });
  });
  it('rejects other error codes even with HTTP 200', () => {
    expect(parseResponse(200, '{"ErrorCode":"006","ErrorMessage":"Invalid template text"}')).toMatchObject({ ok: false, code: '006' });
  });
  it('rejects plain-text failures', () => {
    expect(parseResponse(200, 'Failed#Parameter Missing')).toMatchObject({ ok: false, code: 'TEXT' });
    expect(parseResponse(200, '')).toMatchObject({ ok: false });
  });
  it('rejects HTTP errors', () => {
    expect(parseResponse(500, 'Server error')).toMatchObject({ ok: false, code: 'HTTP_500' });
  });
  it('does not block on an unrecognised success body', () => {
    expect(parseResponse(200, 'Message Submitted')).toEqual({ ok: true, unverified: true });
  });
});

describe('OTP message', () => {
  it('puts the code into the DLT template', () => {
    expect(buildOtpMessage('123456')).toContain('123456');
    expect(buildOtpMessage('123456')).not.toContain('{otp}');
  });
});
