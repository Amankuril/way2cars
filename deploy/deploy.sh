#!/usr/bin/env bash
# Pull latest main, install, rebuild the admin panel and restart the API.
#   ~/way2cars/deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Deploying WAY2CARS…"
git pull --ff-only origin main
npm ci --workspace @way2cars/backend --workspace @way2cars/admin --include-workspace-root

# Admin panel → Nginx
npm run build -w @way2cars/admin
sudo mkdir -p /var/www/way2cars/admin
sudo rsync -a --delete apps/admin/dist/ /var/www/way2cars/admin/

# API
(cd backend && npm run db:indexes)
pm2 startOrReload backend/ecosystem.config.cjs --update-env
pm2 save

sleep 3
curl -fsS http://127.0.0.1:5000/api/ready && echo && echo "Done."
