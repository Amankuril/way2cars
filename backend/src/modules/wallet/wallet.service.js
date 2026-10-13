import { conflict } from '../../core/errors.js';
import { User } from '../users/user.model.js';
import { Vendor } from '../vendors/vendor.model.js';
import { LedgerEntry, Referral } from './wallet.model.js';
import { getSettings } from '../settings/settings.service.js';

/**
 * Wallet & earnings bookkeeping. All functions require a transaction session so that the
 * balance change and its ledger row commit together. Idempotency keys make retries safe.
 */

async function alreadyApplied(key, session) {
  return key ? Boolean(await LedgerEntry.exists({ idempotencyKey: key }).session(session)) : false;
}

export async function creditUserWallet(userId, amountPaise, type, { bookingId, note, key, by } = {}, session) {
  if (amountPaise <= 0 || (await alreadyApplied(key, session))) return null;
  const user = await User.findOneAndUpdate({ _id: userId }, { $inc: { walletBalancePaise: amountPaise } }, { new: true, session }).select('walletBalancePaise');
  const [row] = await LedgerEntry.create([{ owner: { realm: 'user', id: userId }, type, bucket: 'wallet', direction: 'credit', amountPaise, balanceAfterPaise: user.walletBalancePaise, bookingId, note, idempotencyKey: key, createdBy: by }], { session });
  return row;
}

export async function debitUserWallet(userId, amountPaise, type, { bookingId, note, key, by } = {}, session) {
  if (amountPaise <= 0 || (await alreadyApplied(key, session))) return null;
  const user = await User.findOneAndUpdate(
    { _id: userId, walletBalancePaise: { $gte: amountPaise } },
    { $inc: { walletBalancePaise: -amountPaise } },
    { new: true, session },
  ).select('walletBalancePaise');
  if (!user) throw conflict('Your wallet balance changed. Please review the price again.', 'WALLET_INSUFFICIENT');
  const [row] = await LedgerEntry.create([{ owner: { realm: 'user', id: userId }, type, bucket: 'wallet', direction: 'debit', amountPaise, balanceAfterPaise: user.walletBalancePaise, bookingId, note, idempotencyKey: key, createdBy: by }], { session });
  return row;
}

/** Host earning lands in "pending" and is released to "available" after the hold period. */
export async function creditVendorEarning(vendorId, amountPaise, { bookingId, key }, session) {
  if (amountPaise <= 0 || (await alreadyApplied(key, session))) return null;
  const { payouts } = await getSettings();
  const releaseAt = new Date(Date.now() + payouts.holdDays * 86400_000);
  const v = await Vendor.findOneAndUpdate({ _id: vendorId }, { $inc: { 'wallet.pendingPaise': amountPaise, 'wallet.lifetimeEarnedPaise': amountPaise } }, { new: true, session }).select('wallet');
  const [row] = await LedgerEntry.create([{ owner: { realm: 'vendor', id: vendorId }, type: 'trip_earning', bucket: 'pending', direction: 'credit', amountPaise, balanceAfterPaise: v.wallet.pendingPaise, bookingId, releaseAt, released: false, idempotencyKey: key }], { session });
  return row;
}

export async function releaseVendorEarning(entry, session) {
  const claimed = await LedgerEntry.findOneAndUpdate({ _id: entry._id, released: false }, { $set: { released: true } }, { session, new: true });
  if (!claimed) return null;
  const v = await Vendor.findOneAndUpdate(
    { _id: entry.owner.id, 'wallet.pendingPaise': { $gte: entry.amountPaise } },
    { $inc: { 'wallet.pendingPaise': -entry.amountPaise, 'wallet.availablePaise': entry.amountPaise } },
    { new: true, session },
  ).select('wallet');
  if (!v) throw new Error(`Vendor ${entry.owner.id} pending balance inconsistent`);
  await LedgerEntry.create([{ owner: entry.owner, type: 'earning_released', bucket: 'available', direction: 'credit', amountPaise: entry.amountPaise, balanceAfterPaise: v.wallet.availablePaise, bookingId: entry.bookingId, idempotencyKey: `release:${entry._id}` }], { session });
  return v;
}

/** Moves available → locked when a withdrawal is requested. */
export async function lockForPayout(vendorId, amountPaise, payoutRequestId, session) {
  const v = await Vendor.findOneAndUpdate(
    { _id: vendorId, 'wallet.availablePaise': { $gte: amountPaise } },
    { $inc: { 'wallet.availablePaise': -amountPaise, 'wallet.lockedPaise': amountPaise } },
    { new: true, session },
  ).select('wallet');
  if (!v) throw conflict('Withdrawal amount exceeds your available balance.', 'INSUFFICIENT_BALANCE');
  await LedgerEntry.create([{ owner: { realm: 'vendor', id: vendorId }, type: 'payout_requested', bucket: 'locked', direction: 'credit', amountPaise, balanceAfterPaise: v.wallet.lockedPaise, payoutRequestId, idempotencyKey: `payout-lock:${payoutRequestId}` }], { session });
}

export async function settlePayout(vendorId, amountPaise, payoutRequestId, outcome, session) {
  const inc = outcome === 'paid'
    ? { 'wallet.lockedPaise': -amountPaise, 'wallet.lifetimePaidOutPaise': amountPaise }
    : { 'wallet.lockedPaise': -amountPaise, 'wallet.availablePaise': amountPaise };
  const v = await Vendor.findOneAndUpdate({ _id: vendorId, 'wallet.lockedPaise': { $gte: amountPaise } }, { $inc: inc }, { new: true, session }).select('wallet');
  if (!v) throw new Error(`Vendor ${vendorId} locked balance inconsistent`);
  await LedgerEntry.create([{
    owner: { realm: 'vendor', id: vendorId },
    type: outcome === 'paid' ? 'payout_paid' : 'payout_rejected',
    bucket: outcome === 'paid' ? 'paid_out' : 'available',
    direction: outcome === 'paid' ? 'debit' : 'credit',
    amountPaise,
    balanceAfterPaise: outcome === 'paid' ? v.wallet.lifetimePaidOutPaise : v.wallet.availablePaise,
    payoutRequestId,
    idempotencyKey: `payout-${outcome}:${payoutRequestId}`,
  }], { session });
}

/** Records who referred a new user. Rewards are granted after the referee's first completed trip. */
export async function attachReferral(user, code, session) {
  const { referral } = await getSettings();
  if (!referral.enabled || !code) return null;
  const referrer = await User.findOne({ referralCode: code.toUpperCase(), status: 'active' }).select('_id').session(session).lean();
  if (!referrer || String(referrer._id) === String(user._id)) throw conflict('This referral code is not valid.', 'REFERRAL_INVALID');
  if (await Referral.exists({ refereeId: user._id }).session(session)) return null;
  await User.updateOne({ _id: user._id }, { $set: { referredBy: referrer._id } }, { session });
  const [r] = await Referral.create([{ referrerId: referrer._id, refereeId: user._id, code: code.toUpperCase() }], { session });
  return r;
}

/** Called when a booking completes. Returns rewarded referral (for notifications) or null. */
export async function rewardReferralIfQualified(userId, bookingId, session) {
  const { referral } = await getSettings();
  if (!referral.enabled) return null;
  const r = await Referral.findOneAndUpdate(
    { refereeId: userId, status: 'pending' },
    { $set: { status: 'rewarded', rewardedAt: new Date(), qualifyingBookingId: bookingId, referrerRewardPaise: referral.referrerRewardPaise, refereeRewardPaise: referral.refereeRewardPaise } },
    { new: true, session },
  );
  if (!r) return null;
  await creditUserWallet(r.referrerId, referral.referrerRewardPaise, 'referral_reward', { bookingId, key: `ref-referrer:${r._id}`, note: 'Friend completed their first trip' }, session);
  await creditUserWallet(r.refereeId, referral.refereeRewardPaise, 'referral_reward', { bookingId, key: `ref-referee:${r._id}`, note: 'Welcome reward for joining with a referral' }, session);
  return r;
}

export const serializeLedger = (e) => ({ id: e._id, type: e.type, bucket: e.bucket, direction: e.direction, amountPaise: e.amountPaise, balanceAfterPaise: e.balanceAfterPaise, bookingId: e.bookingId, payoutRequestId: e.payoutRequestId, releaseAt: e.releaseAt, note: e.note, createdAt: e.createdAt });
