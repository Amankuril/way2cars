import mongoose from 'mongoose';

const Counter = mongoose.model(
  'Counter',
  new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false }),
  'counters',
);

/** Atomically returns the next value of a named sequence (gap-free within a transaction). */
export async function nextSequence(name, session) {
  const doc = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, new: true, session });
  return doc.seq;
}

/** Indian financial year label, e.g. 2026-27 for dates from 1 Apr 2026. */
export function financialYear(date = new Date()) {
  const ist = new Date(date.getTime() + 330 * 60000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
