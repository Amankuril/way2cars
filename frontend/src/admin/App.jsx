import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, useLocation } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { Layout } from '@/admin/components/Layout.jsx';
import { RequireAuth, RequirePermission, FullPageLoader } from '@/admin/auth/guards.jsx';
import { PageTitleProvider } from '@/admin/components/PageTitle.jsx';
import { RouteError } from '@/admin/pages/RouteError.jsx';

const page = (loader) => lazy(loader);

const Login = page(() => import('@/admin/pages/auth/Login.jsx'));
const MfaSetup = page(() => import('@/admin/pages/auth/MfaSetup.jsx'));
const Dashboard = page(() => import('@/admin/pages/Dashboard.jsx'));
const BookingsList = page(() => import('@/admin/pages/operations/BookingsList.jsx'));
const BookingDetail = page(() => import('@/admin/pages/operations/BookingDetail.jsx'));
const TicketsList = page(() => import('@/admin/pages/operations/TicketsList.jsx'));
const TicketDetail = page(() => import('@/admin/pages/operations/TicketDetail.jsx'));
const KycQueue = page(() => import('@/admin/pages/verification/KycQueue.jsx'));
const KycReview = page(() => import('@/admin/pages/verification/KycReview.jsx'));
const VehiclesList = page(() => import('@/admin/pages/fleet/VehiclesList.jsx'));
const VehicleDetail = page(() => import('@/admin/pages/fleet/VehicleDetail.jsx'));
const VehicleRequests = page(() => import('@/admin/pages/fleet/VehicleRequests.jsx'));
const VehicleRequestDetail = page(() => import('@/admin/pages/fleet/VehicleRequestDetail.jsx'));
const HostRequests = page(() => import('@/admin/pages/fleet/HostRequests.jsx'));
const HostRequestDetail = page(() => import('@/admin/pages/fleet/HostRequestDetail.jsx'));
const HostsList = page(() => import('@/admin/pages/fleet/HostsList.jsx'));
const HostDetail = page(() => import('@/admin/pages/fleet/HostDetail.jsx'));
const UsersList = page(() => import('@/admin/pages/customers/UsersList.jsx'));
const UserDetail = page(() => import('@/admin/pages/customers/UserDetail.jsx'));
const Payouts = page(() => import('@/admin/pages/finance/Payouts.jsx'));
const Reports = page(() => import('@/admin/pages/finance/Reports.jsx'));
const CouponsList = page(() => import('@/admin/pages/marketing/CouponsList.jsx'));
const CouponEdit = page(() => import('@/admin/pages/marketing/CouponEdit.jsx'));
const Banners = page(() => import('@/admin/pages/marketing/Banners.jsx'));
const Broadcast = page(() => import('@/admin/pages/marketing/Broadcast.jsx'));
const CmsPages = page(() => import('@/admin/pages/content/CmsPages.jsx'));
const CmsPageEditor = page(() => import('@/admin/pages/content/CmsPageEditor.jsx'));
const Faqs = page(() => import('@/admin/pages/content/Faqs.jsx'));
const Catalog = page(() => import('@/admin/pages/content/Catalog.jsx'));
const Reviews = page(() => import('@/admin/pages/moderation/Reviews.jsx'));
const Settings = page(() => import('@/admin/pages/system/Settings.jsx'));
const Admins = page(() => import('@/admin/pages/system/Admins.jsx'));
const AuditLog = page(() => import('@/admin/pages/system/AuditLog.jsx'));
const Integrations = page(() => import('@/admin/pages/system/Integrations.jsx'));
const Security = page(() => import('@/admin/pages/system/Security.jsx'));
const NotFound = page(() => import('@/admin/pages/NotFound.jsx'));

/** Old "/kyc" bookmarks: renter KYC now lives under Customers, host KYC under Host requests. */
function KycRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  if (params.get('subjectType') === 'vendor') return <Navigate to="/hosts/requests" replace />;
  params.delete('subjectType');
  const rest = params.toString();
  return <Navigate to={`/renter-kyc${rest ? `?${rest}` : ''}`} replace />;
}

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
        { path: 'renter-kyc', element: guard('kyc.review', KycQueue) },
        { path: 'renter-kyc/:id', element: guard('kyc.review', KycReview) },
        { path: 'kyc', element: <KycRedirect /> },
        { path: 'kyc/:id', element: guard('kyc.review', KycReview) },
        { path: 'vehicles', element: guard('vehicles.read', VehiclesList) },
        { path: 'vehicles/requests', element: guard('vehicles.read', VehicleRequests) },
        { path: 'vehicles/requests/:id', element: guard('vehicles.read', VehicleRequestDetail) },
        { path: 'vehicles/:id', element: guard('vehicles.read', VehicleDetail) },
        { path: 'hosts', element: guard('vendors.read', HostsList) },
        { path: 'hosts/requests', element: guard('vendors.read', HostRequests) },
        { path: 'hosts/requests/:id', element: guard('vendors.read', HostRequestDetail) },
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
