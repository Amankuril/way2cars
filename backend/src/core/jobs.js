import mongoose from 'mongoose';
import os from 'node:os';
import { logger } from './logger.js';

const JobLock = mongoose.model(
  'JobLock',
  new mongoose.Schema(
    { _id: String, owner: String, lockedUntil: Date, lastRunAt: Date, lastError: String },
    { versionKey: false },
  ),
  'job_locks',
);

const owner = `${os.hostname()}:${process.pid}`;
const timers = [];

async function acquire(name, ttlMs) {
  const now = new Date();
  try {
    const doc = await JobLock.findOneAndUpdate(
      { _id: name, $or: [{ lockedUntil: { $lt: now } }, { lockedUntil: null }] },
      { $set: { owner, lockedUntil: new Date(now.getTime() + ttlMs) } },
      { upsert: true, new: true },
    );
    return doc?.owner === owner;
  } catch (err) {
    if (err?.code === 11000) return false; // another instance holds it
    throw err;
  }
}

/** Runs fn every intervalMs on exactly one instance (Mongo lease lock), never overlapping. */
export function schedule(name, intervalMs, fn) {
  const tick = async () => {
    try {
      if (!(await acquire(name, Math.max(intervalMs, 60000)))) return;
      await fn();
      await JobLock.updateOne({ _id: name }, { $set: { lastRunAt: new Date(), lastError: null, lockedUntil: new Date(Date.now() + intervalMs - 1000) } });
    } catch (err) {
      logger.error({ err, job: name }, 'scheduled job failed');
      await JobLock.updateOne({ _id: name }, { $set: { lastError: String(err?.message).slice(0, 500), lockedUntil: new Date() } }).catch(() => {});
    }
  };
  const t = setInterval(tick, intervalMs);
  t.unref();
  timers.push(t);
  setTimeout(tick, 5000).unref();
}

export function stopJobs() {
  timers.splice(0).forEach(clearInterval);
}
