import { Router } from 'express';
import mongoose from 'mongoose';
import { ok } from './core/http.js';
import { authenticate, requireApprovedVendor } from './middleware/auth.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { filesRouter, uploadRoutes } from './modules/files/files.routes.js';
import { notificationRoutes } from './modules/notifications/notification.routes.js';
import { publicCatalogRouter, adminCatalogRouter } from './modules/catalog/catalog.routes.js';
import { publicCmsRouter, adminCmsRouter } from './modules/cms/cms.routes.js';
import { searchRouter } from './modules/search/search.routes.js';
import { userAccountRouter } from './modules/users/user.routes.js';
import { vendorAccountRouter } from './modules/vendors/vendor.routes.js';
import { vendorVehicleRouter, adminVehicleRouter } from './modules/vehicles/vehicle.routes.js';
import { userBookingRouter, userPaymentsRouter, vendorBookingRouter, adminBookingRouter } from './modules/bookings/booking.routes.js';
import { userReviewRouter, vendorReviewRouter, adminReviewRouter } from './modules/reviews/review.routes.js';
import { requesterSupportRouter, adminSupportRouter } from './modules/support/support.routes.js';
import { vendorEarningsRouter, adminPayoutRouter } from './modules/payouts/payout.routes.js';
import { userOffersRouter, adminCouponRouter } from './modules/coupons/coupon.routes.js';
import { mapsRouter } from './modules/maps/maps.routes.js';
import { adminTrackingRouter, ingestTracking } from './modules/tracking/tracking.js';
import { adminUsersRouter, adminVendorsRouter, adminKycRouter } from './modules/admin/admin.users.routes.js';
import { adminCoreRouter } from './modules/admin/admin.core.routes.js';
import { adminReportsRouter } from './modules/reports/report.routes.js';
import { handleRazorpayWebhook } from './modules/payments/payment.service.js';
import { getSettings, publicSettings } from './modules/settings/settings.service.js';
import { publicKeyId } from './integrations/razorpay.js';
import { env } from './config/env.js';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => res.json({ status: 'ok' }));
apiRouter.get('/ready', async (_req, res) => {
  const up = mongoose.connection.readyState === 1;
  if (up) await mongoose.connection.db.admin().ping();
  res.status(up ? 200 : 503).json({ status: up ? 'ready' : 'unavailable' });
});

const v1 = Router();

// ---- public (no auth)
v1.use('/auth', authRouter);
v1.get('/public/config', async (_req, res) => {
  const s = await getSettings();
  ok(res, { ...publicSettings(s), razorpayKeyId: publicKeyId(), mapsBrowserKey: env.GOOGLE_MAPS_BROWSER_KEY || null, apiVersion: 1 });
});
v1.use('/public', publicCatalogRouter, publicCmsRouter, searchRouter);

// ---- webhooks (raw body, signature-verified)
v1.post('/webhooks/razorpay', async (req, res) => {
  const r = await handleRazorpayWebhook(req.body, req.get('x-razorpay-signature'), req.get('x-razorpay-event-id'));
  res.status(r.httpStatus).json(r.body);
});
v1.post('/webhooks/tracking', async (req, res) => {
  const r = await ingestTracking(req.body, req.get('x-signature'));
  res.status(r.httpStatus).json(r.body);
});

// ---- private files (any realm, permission-checked per file)
v1.use('/files', filesRouter);

// ---- user realm
const user = Router();
user.use(authenticate('user'));
user.use('/', userAccountRouter);
user.use('/uploads', uploadRoutes('user'));
user.use('/notifications', notificationRoutes());
user.use('/bookings', userBookingRouter);
user.use('/payments', userPaymentsRouter);
user.use('/reviews', userReviewRouter);
user.use('/support', requesterSupportRouter('user'));
user.use('/offers', userOffersRouter);
user.use('/maps', mapsRouter);
v1.use('/user', user);

// ---- vendor realm
const vendor = Router();
vendor.use(authenticate('vendor'));
vendor.use('/', vendorAccountRouter);
vendor.use('/uploads', uploadRoutes('vendor'));
vendor.use('/notifications', notificationRoutes());
vendor.use('/vehicles', vendorVehicleRouter);
vendor.use('/bookings', requireApprovedVendor, vendorBookingRouter);
vendor.use('/reviews', vendorReviewRouter);
vendor.use('/earnings', vendorEarningsRouter);
vendor.use('/support', requesterSupportRouter('vendor'));
vendor.use('/maps', mapsRouter);
v1.use('/vendor', vendor);

// ---- admin realm (every route also checks a permission)
const admin = Router();
admin.use(authenticate('admin'));
admin.use('/', adminCoreRouter);
admin.use('/uploads', uploadRoutes('admin'));
admin.use('/notifications', notificationRoutes());
admin.use('/reports', adminReportsRouter);
admin.use('/users', adminUsersRouter);
admin.use('/vendors', adminVendorsRouter);
admin.use('/kyc', adminKycRouter);
admin.use('/vehicles', adminVehicleRouter);
admin.use('/bookings', adminBookingRouter);
admin.use('/payouts', adminPayoutRouter);
admin.use('/coupons', adminCouponRouter);
admin.use('/reviews', adminReviewRouter);
admin.use('/support', adminSupportRouter);
admin.use('/catalog', adminCatalogRouter);
admin.use('/cms', adminCmsRouter);
admin.use('/tracking', adminTrackingRouter);
admin.use('/maps', mapsRouter);
v1.use('/admin', admin);

apiRouter.use('/v1', v1);
