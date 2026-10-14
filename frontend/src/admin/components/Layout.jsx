import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, KeyRound, LogOut, Menu, X } from 'lucide-react';
import { NAV, matchNav, ROLE_LABEL } from '@/admin/lib/nav.js';
import { api, ADMIN } from '@/admin/lib/api.js';
import { useRenterKycPending } from '@/admin/lib/hooks.js';
import { cn } from '@/admin/lib/utils.js';
import { initials } from '@shared/lib/format.js';
import { useAuth } from '@/admin/auth/AuthContext.jsx';
import { useCurrentPageTitle } from './PageTitle.jsx';
import { Skeleton } from './Skeleton.jsx';
import { useToast } from './Toast.jsx';

/** Sidebar badge counts come from the live dashboard queues. */
const BADGES = {
  '/renter-kyc': (q) => q.renterKyc,
  '/hosts/requests': (q) => q.vendorApprovals,
  '/vehicles': (q) => q.vehicleReviews,
  '/support': (q) => q.openTickets,
  '/payouts': (q) => q.payouts,
};

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 rounded-md focus-visible:outline-offset-4">
      <img src={`${import.meta.env.BASE_URL}mark.png`} alt="" width="58" height="24" className="h-6 w-auto" />
      <span className="text-[17px] font-extrabold leading-none tracking-[0.02em] text-ink-900">WAY2CARS</span>
      <span className="rounded-sm bg-ink-900 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wider text-white">Admin</span>
    </Link>
  );
}

function Sidebar({ onNavigate }) {
  const { can } = useAuth();
  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get(`${ADMIN}/reports/dashboard`),
    enabled: can('dashboard.read'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const renterKyc = useRenterKycPending(can('kyc.review'));
  const queues = data?.queues || renterKyc ? { ...data?.queues, renterKyc } : null; // renter-only KYC count
  // One active item per route: the longest matching nav path ("/hosts/requests" wins over "/hosts").
  const { pathname } = useLocation();
  const activeTo = matchNav(pathname)?.item.to;

  return (
    <nav aria-label="Main" className="scroll-thin flex-1 overflow-y-auto px-3 pb-6 pt-2">
      {NAV.map((group) => {
        const items = group.items.filter((i) => can(i.perm));
        if (!items.length) return null;
        return (
          <div key={group.label} className="mt-4 first:mt-1">
            <p className="overline px-3 pb-1.5">{group.label}</p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const badge = queues && BADGES[item.to]?.(queues);
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex h-9 items-center gap-2.5 rounded-md px-3 text-label transition-colors',
                          isActive && activeTo === item.to ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-ink-100 hover:text-ink-900',
                        )
                      }
                      aria-current={activeTo === item.to ? 'page' : 'false'}
                    >
                      {({ isActive: routeActive }) => {
                        const isActive = routeActive && activeTo === item.to;
                        return (
                          <>
                            <span className={cn('absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full', isActive ? 'bg-brand-500' : 'bg-transparent')} aria-hidden="true" />
                            <item.icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-brand-600' : 'text-ink-500 group-hover:text-ink-700')} aria-hidden="true" strokeWidth={2.1} />
                            <span className="truncate">{item.label}</span>
                            {badge ? (
                              <span className={cn('num ml-auto rounded-full px-1.5 py-px text-caption font-bold', isActive ? 'bg-brand-500 text-white' : 'bg-ink-100 text-ink-700')} aria-label={`${badge} waiting`}>
                                {badge > 99 ? '99+' : badge}
                              </span>
                            ) : null}
                          </>
                        );
                      }}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function AdminMenu() {
  const { admin, logout } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-md py-1 pl-1 pr-2 hover:bg-ink-100"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-900 text-caption font-bold text-white">{initials(admin?.name)}</span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-[160px] truncate text-label text-ink-900">{admin?.name}</span>
          <span className="block text-caption text-ink-500">{ROLE_LABEL[admin?.role] || admin?.role}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-ink-400" aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-40 mt-1.5 w-64 rounded-lg border border-line bg-surface p-1.5 shadow-pop">
          <div className="border-b border-line px-3 pb-2.5 pt-1.5">
            <p className="truncate text-label text-ink-900">{admin?.name}</p>
            <p className="truncate text-caption text-ink-500">{admin?.email}</p>
            {!admin?.mfaEnabled ? <p className="mt-1.5 text-caption font-semibold text-warning-700">Two-factor sign-in is off</p> : null}
          </div>
          <Link role="menuitem" to="/account/security" onClick={() => setOpen(false)} className="mt-1 flex items-center gap-2 rounded-md px-3 py-2 text-label text-ink-700 hover:bg-ink-100">
            <KeyRound className="h-4 w-4 text-ink-500" aria-hidden="true" /> My security
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={async () => {
              setOpen(false);
              await logout();
              toast.info('Signed out');
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-label text-ink-700 hover:bg-ink-100"
          >
            <LogOut className="h-4 w-4 text-ink-500" aria-hidden="true" /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Breadcrumbs() {
  const { pathname } = useLocation();
  const title = useCurrentPageTitle();
  const hit = matchNav(pathname);
  const crumbs = [];
  if (hit) {
    crumbs.push({ label: hit.group.label });
    crumbs.push({ label: hit.item.label, to: pathname === hit.item.to ? null : hit.item.to });
    if (title && title !== hit.item.label && pathname !== hit.item.to) crumbs.push({ label: title });
  } else if (title) crumbs.push({ label: title });
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-label">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${c.label}-${i}`} className={cn('flex min-w-0 items-center gap-1.5', i === 0 && 'hidden sm:flex')}>
              {i > 0 ? <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-ink-300', i === 1 && 'hidden sm:block')} aria-hidden="true" /> : null}
              {c.to ? (
                <Link to={c.to} className="truncate text-ink-500 hover:text-brand-600">{c.label}</Link>
              ) : (
                <span className={cn('truncate', last ? 'font-bold text-ink-900' : 'text-ink-500')} aria-current={last ? 'page' : undefined}>{c.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function PageFallback() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading page">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="panel space-y-3 p-5">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-4" />)}
      </div>
    </div>
  );
}

export function Layout() {
  const [drawer, setDrawer] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => {
    setDrawer(false);
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-canvas">
      <a href="#main" className="sr-only z-50 rounded-md bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-14 shrink-0 items-center border-b border-line px-5">
          <Brand />
        </div>
        <Sidebar />
      </aside>

      {/* Mobile / tablet drawer */}
      {drawer ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/40" onClick={() => setDrawer(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-surface" aria-label="Navigation drawer">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
              <Brand />
              <button type="button" onClick={() => setDrawer(false)} className="rounded-md p-1.5 text-ink-500 hover:bg-ink-100" aria-label="Close navigation">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button type="button" onClick={() => setDrawer(true)} className="-ml-1 rounded-md p-1.5 text-ink-600 hover:bg-ink-100 lg:hidden" aria-label="Open navigation" aria-expanded={drawer}>
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <Breadcrumbs />
          </div>
          <AdminMenu />
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1480px] px-4 py-6 focus:outline-none sm:px-6 lg:px-8">
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
