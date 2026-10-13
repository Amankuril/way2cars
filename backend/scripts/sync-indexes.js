// Builds/updates all MongoDB indexes (production runs with autoIndex off). Run after each deploy.
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../src/core/db.js';
await import('../src/app.js'); // registers every model
await import('../src/modules/tracking/tracking.js');
await connectDb();
for (const m of Object.values(mongoose.models)) {
  await m.createCollection().catch(() => {});
  const dropped = await m.syncIndexes();
  console.log(`${m.collection.collectionName}: indexes synced${dropped.length ? ` (dropped ${dropped.join(', ')})` : ''}`);
}
await disconnectDb();
