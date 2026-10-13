import { Router } from 'express';
import mongoose from 'mongoose';
import { authRouter } from './modules/auth/auth.routes.js';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => res.json({ status: 'ok' }));
apiRouter.get('/ready', async (_req, res) => {
  const up = mongoose.connection.readyState === 1;
  if (up) await mongoose.connection.db.admin().ping();
  res.status(up ? 200 : 503).json({ status: up ? 'ready' : 'unavailable' });
});

const v1 = Router();
v1.use('/auth', authRouter);
apiRouter.use('/v1', v1);

export { v1 };
