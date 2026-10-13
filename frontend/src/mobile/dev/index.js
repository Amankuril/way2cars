import { lazy } from 'react';

/** Dev-only screens merged into each sub-app router; empty (and tree-shaken) in production builds. */
export const DEV_ROUTES = import.meta.env.DEV ? { DevKitchen: '/__kitchen' } : {};
export const DEV_SCREENS = import.meta.env.DEV ? { DevKitchen: { component: lazy(() => import('./Kitchen.jsx')), access: 'public' } } : {};
