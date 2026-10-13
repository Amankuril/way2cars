# WAY2CARS Admin Panel

React 19 + Vite + Tailwind 3.4 back-office for the WAY2CARS marketplace, served at `/admin/`.

## Develop

```bash
npm install                       # from the repo root (npm workspaces)
npm run dev -w @way2cars/admin    # http://localhost:5173/admin/
```

The dev server proxies `/api` and `/uploads` to the backend (`VITE_BACKEND_URL`, default
`http://localhost:4000`), so the httpOnly admin refresh cookie is same-origin. Create an admin with
`npm run admin:create -w @way2cars/backend`; two-factor enrolment is enforced on first sign-in.

## Build

```bash
npm run build -w @way2cars/admin      # → apps/admin/dist
npm run preview -w @way2cars/admin    # http://localhost:5173/admin/ (same proxy)
```

In production Nginx serves `dist/` under `/admin/` and `/api` from the same origin, so the API
base URL is relative and no build-time env is needed.

## Structure

- `src/lib/` — API client (shared `apps/shared/lib/api-client.js`), hooks, labels, helpers
- `src/auth/` — session context (access token in memory, refresh via cookie) and route guards
- `src/components/` — layout, tables, filters, forms, dialogs, secure file viewers, charts
- `src/pages/<area>/` — lazy-loaded screens; navigation lives in `src/lib/nav.js`

Money is integer paise in the API and rupees in the UI; dates are shown in IST. Sidebar items and
actions are hidden when the signed-in admin lacks the permission (the API enforces it as well).
