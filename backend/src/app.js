import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './core/logger.js';
import { apiRouter } from './routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { rejectOperatorKeys } from './middleware/sanitize.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', /^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY);
  app.set('query parser', 'simple'); // no nested objects from query strings

  app.use((req, res, next) => {
    req.id = req.get('x-request-id')?.slice(0, 64) || crypto.randomUUID();
    res.set('x-request-id', req.id);
    next();
  });
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url.split('?')[0] }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.CORS_ORIGINS.includes(origin)),
      credentials: true,
      allowedHeaders: ['content-type', 'authorization', 'x-w2c-client', 'x-request-id', 'idempotency-key'],
      exposedHeaders: ['x-request-id', 'retry-after'],
      maxAge: 600,
    }),
  );
  app.use(cookieParser());

  // Raw body is required for webhook signature verification, so webhooks parse their own body.
  app.use('/api/v1/webhooks', express.raw({ type: '*/*', limit: '1mb' }));
  app.use(express.json({ limit: '200kb' }));
  app.use(rejectOperatorKeys);

  if (env.SERVE_PUBLIC_UPLOADS && !env.isProd) {
    app.use('/uploads', express.static(env.PUBLIC_UPLOAD_DIR, { index: false, dotfiles: 'deny', maxAge: '7d', immutable: true }));
  }

  app.use('/api', apiLimiter, apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
