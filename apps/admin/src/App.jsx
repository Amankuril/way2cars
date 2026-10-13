import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { Layout } from '@/components/Layout.jsx';
import { RequireAuth, RequirePermission, FullPageLoader } from '@/auth/guards.jsx';
import { PageTitleProvider } from '@/components/PageTitle.jsx';
import { RouteError } from '@/pages/RouteError.jsx';

const page = (loader) => lazy(loader);

const Login = page(() => import('@/pages/auth/Login.jsx'));
const MfaSetup = page(() => import('@/pages/auth/MfaSetup.jsx'));
const Dashboard = page(() => import('@/pages/Dashboard.jsx'));
const BookingsList = page(() => import('@/pages/operations/BookingsList.jsx'));
const BookingDetail = page(() => import('@/pages/operations/BookingDetail.jsx'));
const TicketsList = page(() => import('@/pages/operations/TicketsList.jsx'));
const TicketDetail = page(() => import('@/pages/operations/TicketDetail.jsx'));
const KycQueue = page(() => import('@/pages/verification/KycQueue.jsx'));
const KycReview = page(() => import('@/pages/verification/KycReview.jsx'));
const VehiclesList = page(() => import('@/pages/fleet/VehiclesList.jsx'));
const VehicleDetail = page(() => import('@/pages/fleet/VehicleDetail.jsx'));
const HostsList = page(() => import('@/pages/fleet/HostsList.jsx'));
const HostDetail = page(() => import('@/pages/fleet/HostDetail.jsx'));
const UsersList = page(() => import('@/pages/customers/UsersList.jsx'));
const UserDetail = page(() => import('@/pages/customers/UserDetail.jsx'));
const Payouts = page(() => import('@/pages/finance/Payouts.jsx'));
const Reports = page(() => import('@/pages/finance/Reports.jsx'));
const CouponsList = page(() => import('@/pages/marketing/CouponsList.jsx'));
const CouponEdit = page(() => import('@/pages/marketing/CouponEdit.jsx'));
const Banners = page(() => import('@/pages/marketing/Banners.jsx'));
const Broadcast = page(() => import('@/pages/marketing/Broadcast.jsx'));
const CmsPages = page(() => import('@/pages/content/CmsPages.jsx'));
const CmsPageEditor = page(() => import('@/pages/content/CmsPageEditor.jsx'));
const Faqs = page(() => import('@/pages/content/Faqs.jsx'));
const Catalog = page(() => import('@/pages/content/Catalog.jsx'));
const Reviews = page(() => import('@/pages/moderation/Reviews.jsx'));
const Settings = page(() => import('@/pages/system/Settings.jsx'));
const Admins = page(() => import('@/pages/system/Admins.jsx'));
const AuditLog = page(() => import('@/pages/system/AuditLog.jsx'));
const Integrations = page(() => import('@/pages/system/Integrations.jsx'));
const Security = page(() => import('@/pages/system/Security.jsx'));
const NotFound = page(() => import('@/pages/NotFound.jsx'));

const guard = (perm, Component) => (
  <RequirePermission perm={perm}>
    <Component />
  </RequirePermission>
);

const router = createBrowserRouter(
  [
    { path: '/login', element: <Login />, errorElement: <RouteError /> },
    {
      path: '/mfa-setup',
      element: (
        <RequireAuth>
          <MfaSetup />
        </RequireAuth>
      ),
      errorElement: <RouteError />,
    },
    {
      path: '/',
      element: (
        <RequireAuth>
          <PageTitleProvider>
            <Layout />
          </PageTitleProvider>
        </RequireAuth>
      ),
      errorElement: <RouteError />,
      children: [
        { index: true, element: guard('dashboard.read', Dashboard) },
        { path: 'bookings', element: guard('bookings.read', BookingsList) },
        { path: 'bookings/:id', element: guard('bookings.read', BookingDetail) },
        { path: 'support', element: guard('support.manage', TicketsList) },
        { path: 'support/:id', element: guard('support.manage', TicketDetail) },
        { path: 'kyc', element: guard('kyc.review', KycQueue) },
        { path: 'kyc/:id', element: guard('kyc.review', KycReview) },
        { path: 'vehicles', element: guard('vehicles.read', VehiclesList) },
        { path: 'vehicles/:id', element: guard('vehicles.read', VehicleDetail) },
        { path: 'hosts', element: guard('vendors.read', HostsList) },
        { path: 'hosts/:id', element: guard('vendors.read', HostDetail) },
        { path: 'users', element: guard('users.read', UsersList) },
        { path: 'users/:id', element: guard('users.read', UserDetail) },
        { path: 'payouts', element: guard('payouts.manage', Payouts) },
        { path: 'reports', element: guard('reports.read', Reports) },
        { path: 'coupons', element: guard('coupons.manage', CouponsList) },
        { path: 'coupons/new', element: guard('coupons.manage', CouponEdit) },
        { path: 'coupons/:id', element: guard('coupons.manage', CouponEdit) },
        { path: 'banners', element: guard('banners.manage', Banners) },
        { path: 'broadcast', element: guard('coupons.manage', Broadcast) },
        { path: 'content', element: <Navigate to="/content/pages" replace /> },
        { path: 'content/pages', element: guard('cms.manage', CmsPages) },
        { path: 'content/pages/:slug', element: guard('cms.manage', CmsPageEditor) },
        { path: 'content/faqs', element: guard('cms.manage', Faqs) },
        { path: 'catalog', element: guard('catalog.manage', Catalog) },
        { path: 'reviews', element: guard('reviews.manage', Reviews) },
        { path: 'system', element: <Navigate to="/system/settings" replace /> },
        { path: 'system/settings', element: guard('settings.manage', Settings) },
        { path: 'system/admins', element: guard('admins.manage', Admins) },
        { path: 'system/audit', element: guard('audit.read', AuditLog) },
        { path: 'system/integrations', element: guard('settings.manage', Integrations) },
        { path: 'account/security', element: <Security /> },
        { path: '*', element: <NotFound /> },
      ],
    },
  ],
  { basename: '/admin' },
);

export default function App() {
  return (
    <Suspense fallback={<FullPageLoader label="Loading…" />}>
      <RouterProvider router={router} />
    </Suspense>
  );
}
