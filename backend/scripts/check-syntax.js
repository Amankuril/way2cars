// Imports the whole app graph so syntax/import errors fail fast (used by `npm run lint`).
process.env.NODE_ENV ||= 'test';
process.env.JWT_ACCESS_SECRET ||= 'x'.repeat(40);
process.env.OTP_HMAC_SECRET ||= 'y'.repeat(40);
const { createApp } = await import('../src/app.js');
await import('../src/jobs/index.js');
createApp();
console.log('backend modules load cleanly');
process.exit(0);
