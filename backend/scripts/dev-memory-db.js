/**
 * Local development without an installed MongoDB: starts a persistent single-node replica set
 * (data in ./storage/devdb) and then the API against it.  npm run dev:memory-db
 */
import fs from 'node:fs';
import path from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.MONGOMS_VERSION ||= '8.0.4';
process.env.MONGOMS_DISTRO ||= 'ubuntu-24.04';
const dbPath = path.resolve('storage/devdb');
fs.mkdirSync(dbPath, { recursive: true });
const rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger', name: 'rs0' }, instanceOpts: [{ dbPath, port: Number(process.env.DEV_MONGO_PORT || 27027) }] });
const uri = rs.getUri('way2cars');
process.env.MONGODB_URI = uri;
console.log(`[dev] MongoDB replica set at ${uri}`);
const stop = async () => {
  await rs.stop({ doCleanup: false });
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
await import('../src/server.js');
