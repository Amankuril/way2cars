import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from './logger.js';

// NoSQL-injection defence lives at the edge: strict zod schemas, flat query parsing, and
// middleware/sanitize.js rejecting operator keys. Server-built filters may use operators freely.
mongoose.set('strictQuery', true);

export async function connectDb(uri = env.MONGODB_URI) {
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, maxPoolSize: 20, autoIndex: !env.isProd });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName) {
    const msg = 'MongoDB is not a replica set — transactions (booking race safety, payments) are unavailable.';
    if (env.isProd) throw new Error(msg);
    logger.warn(msg);
  }
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

/**
 * Runs fn inside a transaction, retrying transient write conflicts (e.g. two bookings racing
 * for the same vehicle). fn receives the session and must pass it to every operation.
 */
export async function withTransaction(fn, { retries = 3 } = {}) {
  let attempt = 0;
  for (;;) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        result = await fn(session);
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      return result;
    } catch (err) {
      const transient = err?.hasErrorLabel?.('TransientTransactionError') || err?.code === 112;
      if (transient && attempt < retries) {
        attempt += 1;
        await new Promise((r) => setTimeout(r, 25 * attempt + Math.random() * 50));
        continue;
      }
      throw err;
    } finally {
      await session.endSession();
    }
  }
}

export const isDuplicateKey = (err) => err?.code === 11000;
export const isValidId = (id) => typeof id === 'string' && mongoose.isValidObjectId(id) && /^[a-f0-9]{24}$/i.test(id);
