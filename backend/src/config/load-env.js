import fs from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

/**
 * Under PM2, backend/.env always wins. `pm2 restart --update-env` copies the shell's variables into the
 * app and keeps them, and those would otherwise beat --env-file on every later restart.
 * Outside PM2, variables set on the command line still override .env.
 */
const file = fileURLToPath(new URL('../../.env', import.meta.url));
if (process.env.pm_id !== undefined && fs.existsSync(file)) {
  Object.assign(process.env, parseEnv(fs.readFileSync(file, 'utf8')));
}
