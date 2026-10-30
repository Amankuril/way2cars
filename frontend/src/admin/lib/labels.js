/** Admin-only status maps (shared ones come from @shared/lib/labels.js). tone ∈ neutral|info|success|warning|danger */
export * from '@shared/lib/labels.js';

export const USER_STATUS = {
  active: { label: 'Active', tone: 'success' },
  pending_approval: { label: 'Awaiting approval', tone: 'warning' },
  suspended: { label: 'Suspended', tone: 'danger' },
  deleted: { label: 'Deleted', tone: 'neutral' },
};
export const PAYMENT_STATUS = {
  pending: { label: 'Unpaid', tone: 'warning' },
  created: { label: 'Order created', tone: 'neutral' },
  paid: { label: 'Paid', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  amount_mismatch: { label: 'Amount mismatch', tone: 'danger' },
  partially_refunded: { label: 'Partly refunded', tone: 'info' },
  refunded: { label: 'Refunded', tone: 'neutral' },
};
export const BANK_STATUS = {
  pending: { label: 'Awaiting verification', tone: 'warning' },
  verified: { label: 'Verified', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
};
export const KYC_SUBMISSION_STATUS = {
  pending: { label: 'Pending review', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  superseded: { label: 'Superseded', tone: 'neutral' },
};
export const ADMIN_TICKET_STATUS = {
  open: { label: 'Open', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'info' },
  awaiting_customer: { label: 'Awaiting customer', tone: 'warning' },
  resolved: { label: 'Resolved', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
};
export const PRIORITY = {
  low: { label: 'Low', tone: 'neutral' },
  normal: { label: 'Normal', tone: 'neutral' },
  high: { label: 'High', tone: 'warning' },
  urgent: { label: 'Urgent', tone: 'danger' },
};
export const ROADSIDE_STAGE = {
  requested: { label: 'Requested', tone: 'warning' },
  assigned: { label: 'Assigned', tone: 'info' },
  en_route: { label: 'En route', tone: 'info' },
  resolved: { label: 'Resolved', tone: 'success' },
};
export const CLAIM_STATUS = {
  pending: { label: 'Awaiting decision', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
};
export const REVIEW_STATUS = {
  published: { label: 'Published', tone: 'success' },
  hidden: { label: 'Hidden', tone: 'neutral' },
};
export const ADMIN_STATUS = {
  active: { label: 'Active', tone: 'success' },
  disabled: { label: 'Disabled', tone: 'neutral' },
};
export const SETTLEMENT_OUTSTANDING = {
  none: { label: 'Nothing due', tone: 'neutral' },
  due: { label: 'Due from renter', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  waived: { label: 'Waived', tone: 'neutral' },
};
export const CAMPAIGN = { discount: 'Discount', referral: 'Referral', festival: 'Festival', first_ride: 'First ride' };
export const PAYMENT_PURPOSE = { booking: 'Booking', balance: 'Booking balance', extension: 'Extension', settlement: 'Settlement dues' };
export const OFFICE_METHOD = { cash: 'Cash', upi: 'UPI', card: 'Card', bank_transfer: 'Bank transfer' };
export const OWNERSHIP = { host: { label: 'Attached host', tone: 'neutral' }, company: { label: 'WAY2CARS fleet', tone: 'info' } };
export const BOOKING_SOURCE = { app: { label: 'App', tone: 'neutral' }, offline: { label: 'Office', tone: 'info' } };
export const OWNER_PAYOUT = {
  pending_trip: { label: 'After trip', tone: 'neutral' }, on_hold: { label: 'On hold', tone: 'warning' }, released: { label: 'Released', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' }, settled: { label: 'Settled', tone: 'success' }, not_applicable: { label: 'Company car', tone: 'info' },
};
export const REFUND_REASON = {
  user_cancellation: 'Cancelled by renter', vendor_rejection: 'Declined by host', approval_timeout: 'Host did not respond',
  admin_cancellation: 'Cancelled by admin', deposit_settlement: 'Deposit refund', late_payment: 'Late payment', admin_adjustment: 'Admin adjustment',
  extension_unavailable: 'Extension unavailable', extension_rejected: 'Extension not approved', price_adjustment: 'Payment adjustment',
};
export const LEDGER_TYPE = {
  referral_reward: 'Referral reward', loyalty_reward: 'Loyalty reward', wallet_redeemed: 'Used on booking',
  wallet_redeem_reversed: 'Booking credit returned', admin_adjustment: 'Admin adjustment', booking_refund: 'Booking refund to wallet', trip_earning: 'Trip earning',
  earning_released: 'Earning released', payout_requested: 'Withdrawal requested', payout_rejected: 'Withdrawal declined',
  payout_paid: 'Payout paid', earning_reversed: 'Earning reversed', investor_earning: 'Investor share', investor_payout: 'Paid to investor',
};
export const WALLET_CATEGORY = { refund: 'Refund', goodwill: 'Goodwill', adjustment: 'Adjustment' };
export const FOLLOW_UP = { contacted: { label: 'Contacted', tone: 'info' }, no_answer: { label: 'No answer', tone: 'warning' }, converted: { label: 'Booked', tone: 'success' }, not_interested: { label: 'Not interested', tone: 'neutral' } };
export const MESSAGE_STATUS = { sent: { label: 'Sent', tone: 'success' }, skipped: { label: 'Not configured', tone: 'neutral' }, failed: { label: 'Failed', tone: 'danger' } };
export const REALM_LABEL = { user: 'Renter', vendor: 'Host', admin: 'Admin', system: 'System', webhook: 'Webhook' };
export const AUDIENCE = { all: 'Everyone', user: 'Renters', vendor: 'Hosts' };

/** Looks up { label, tone } with a readable fallback for unknown values. */
export function statusInfo(map, value) {
  if (value === null || value === undefined || value === '') return { label: '—', tone: 'neutral' };
  return map?.[value] || { label: String(value).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), tone: 'neutral' };
}
