import { describe, it, expect } from 'vitest';
import { parseResponse, buildOtpMessage } from '../src/integrations/sms.js';

describe('Textora SMS response parsing', () => {
  it('accepts success:true and keeps the message id', () => {
    expect(parseResponse(200, '{"message":"SMS sent successfully.","message_id":"abc-1","statusCode":200,"success":true}')).toEqual({ ok: true, providerRef: 'abc-1' });
  });
  it('rejects provider errors', () => {
    expect(parseResponse(401, '{"message":"Invalid API key","message_id":"","statusCode":401,"success":false}')).toEqual({ ok: false, code: '401', reason: 'Invalid API key' });
  });
  it('rejects success:false even with HTTP 200', () => {
    expect(parseResponse(200, '{"message":"Template mismatch","statusCode":400,"success":false}')).toMatchObject({ ok: false, code: '400', reason: 'Template mismatch' });
  });
  it('rejects bodies that do not confirm success', () => {
    expect(parseResponse(200, 'Message Submitted')).toMatchObject({ ok: false, code: 'HTTP_200' });
    expect(parseResponse(200, '')).toMatchObject({ ok: false, reason: 'empty response' });
    expect(parseResponse(502, '<html>Bad gateway</html>')).toMatchObject({ ok: false, code: 'HTTP_502' });
  });
});

describe('OTP message', () => {
  it('puts the code into the DLT template', () => {
    expect(buildOtpMessage('123456')).toContain('123456');
    expect(buildOtpMessage('123456')).not.toContain('{otp}');
  });
});
