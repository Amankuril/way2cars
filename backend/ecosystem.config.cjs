/**
 * PM2 process file for the API.  From backend/:  pm2 start ecosystem.config.cjs && pm2 save
 * The API does not read .env on its own, so Node loads it here (--env-file).
 */
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'way2cars-api',
      script: 'src/server.js',
      cwd: __dirname,
      node_args: `--env-file=${path.join(__dirname, '.env')}`,
      instances: 1, // background jobs run in-process; scale out only with JOBS_ENABLED=false on extra instances
      max_memory_restart: '600M',
      kill_timeout: 10000, // let in-flight requests finish on restart
      time: true,
    },
  ],
};
