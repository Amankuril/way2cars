import { MongoMemoryReplSet } from 'mongodb-memory-server';

// A real single-node replica set so transactions behave exactly as in production.
export default async function setup({ provide }) {
  process.env.MONGOMS_VERSION ||= '8.0.4';
  process.env.MONGOMS_DISTRO ||= 'ubuntu-24.04';
  const rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  provide('mongoUri', rs.getUri());
  return async () => rs.stop();
}
