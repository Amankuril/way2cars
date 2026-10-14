#!/usr/bin/env bash
# Pull latest main, install, rebuild the web frontend (/, /admin, /user, /vendor) and restart the API.
#   ~/way2cars/deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Deploying WAY2CARS…"
git pull --ff-only origin main
npm ci --workspace @way2cars/backend --workspace @way2cars/frontend --include-workspace-root

# Web frontend → Nginx (one SPA build serves /, /admin, /user and /vendor)
npm run build -w @way2cars/frontend
sudo mkdir -p /var/www/way2cars/web
sudo rsync -a --delete frontend/dist/ /var/www/way2cars/web/

# API
(cd backend && npm run db:indexes)
pm2 startOrReload backend/ecosystem.config.cjs --update-env
pm2 save

sleep 3
curl -fsS http://127.0.0.1:5055/api/ready && echo && echo "Done."
