import { schedule } from '../core/jobs.js';
import { purgeOrphanFiles } from '../modules/files/files.service.js';

const MIN = 60_000;

export function startJobs() {
  schedule('files.purge-orphans', 60 * MIN, () => purgeOrphanFiles(24));
}
