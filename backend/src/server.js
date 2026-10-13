import { env } from './config/env.js';
import { logger } from './core/logger.js';
import { connectDb, disconnectDb } from './core/db.js';
import { createApp } from './app.js';
import { startJobs } from './jobs/index.js';
import { stopJobs } from './core/jobs.js';
import { bypassStatus } from './modules/auth/otp.service.js';
import { ensureStorageDirs } from './integrations/storage.js';

async function main() {
  const otp = bypassStatus();
  if (otp.globalBypass) logger.warn('OTP_BYPASS_ENABLED=true — every number accepts the static OTP. Never use in production.');
  if (otp.dummyNumberCount) logger.warn({ count: otp.dummyNumberCount }, 'OTP dummy numbers configured — they accept the static OTP in every environment.');

  await ensureStorageDirs();
  await connectDb();
  const app = createApp();
  const server = app.listen(env.PORT, env.HOST, () => logger.info({ port: env.PORT, host: env.HOST }, 'WAY2CARS API listening'));
  server.keepAliveTimeout = 65_000;
  if (env.JOBS_ENABLED) startJobs();

  const shutdown = async (signal) => {
    logger.info({ signal }, 'shutting down');
    stopJobs();
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 15_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled rejection'));
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
