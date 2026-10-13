/** Human labels and status presentation shared by every app. tone ∈ neutral|info|success|warning|danger */
export const BOOKING_STATUS = {
  pending_payment: { label: 'Awaiting payment', tone: 'warning' },
  pending_vendor_approval: { label: 'Awaiting host', tone: 'info' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  ongoing: { label: 'Trip in progress', tone: 'info' },
  return_pending: { label: 'Return under review', tone: 'warning' },
  completed: { label: 'Completed', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  rejected: { label: 'Declined by host', tone: 'danger' },
  expired: { label: 'Payment not completed', tone: 'neutral' },
};
export const KYC_STATUS = {
  not_submitted: { label: 'Not verified', tone: 'neutral' },
  pending: { label: 'Under review', tone: 'warning' },
  approved: { label: 'Verified', tone: 'success' },
  rejected: { label: 'Needs attention', tone: 'danger' },
};
export const VENDOR_STATUS = {
  onboarding: { label: 'Onboarding', tone: 'neutral' },
  pending_approval: { label: 'Under review', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Changes needed', tone: 'danger' },
  suspended: { label: 'Suspended', tone: 'danger' },
  deleted: { label: 'Deleted', tone: 'neutral' },
};
export const VEHICLE_APPROVAL = {
  draft: { label: 'Draft', tone: 'neutral' },
  pending_review: { label: 'In review', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Changes needed', tone: 'danger' },
};
export const VEHICLE_STATUS = {
  active: { label: 'Active', tone: 'success' },
  offline: { label: 'Offline', tone: 'neutral' },
  maintenance: { label: 'Under maintenance', tone: 'warning' },
};
export const PAYOUT_STATUS = {
  requested: { label: 'Requested', tone: 'warning' },
  approved: { label: 'Processing', tone: 'info' },
  paid: { label: 'Paid', tone: 'success' },
  rejected: { label: 'Declined', tone: 'danger' },
};
export const REFUND_STATUS = {
  pending: { label: 'Initiating', tone: 'warning' },
  initiated: { label: 'In progress', tone: 'info' },
  processed: { label: 'Refunded', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
};
export const TICKET_STATUS = {
  open: { label: 'Open', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'info' },
  awaiting_customer: { label: 'Awaiting your reply', tone: 'warning' },
  resolved: { label: 'Resolved', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
};

export const FUEL = { petrol: 'Petrol', diesel: 'Diesel', cng: 'CNG', electric: 'Electric', hybrid: 'Hybrid' };
export const TRANSMISSION = { manual: 'Manual', automatic: 'Automatic' };
export const BODY_TYPE = { hatchback: 'Hatchback', sedan: 'Sedan', suv: 'SUV', compact_suv: 'Compact SUV', muv: 'MUV', coupe: 'Coupe', convertible: 'Convertible', pickup: 'Pickup', van: 'Van' };
export const FEATURES = {
  ac: 'Air conditioning', bluetooth: 'Bluetooth', gps_navigation: 'GPS navigation', reverse_camera: 'Reverse camera',
  parking_sensors: 'Parking sensors', sunroof: 'Sunroof', cruise_control: 'Cruise control', usb_charger: 'USB charger',
  airbags: 'Airbags', abs: 'ABS', keyless_entry: 'Keyless entry', push_start: 'Push-button start', android_auto: 'Android Auto',
  apple_carplay: 'Apple CarPlay', child_seat: 'Child seat', music_system: 'Music system', power_windows: 'Power windows',
  fastag: 'FASTag', roof_carrier: 'Roof carrier', spare_tyre: 'Spare tyre', first_aid_kit: 'First-aid kit',
};
export const INSURANCE = { comprehensive: 'Comprehensive', zero_dep: 'Zero depreciation', third_party: 'Third party' };
export const ID_PROOF = { aadhaar: 'Aadhaar', passport: 'Passport', voter_id: 'Voter ID' };
export const PHOTO_ANGLE = { front: 'Front', rear: 'Rear', left: 'Left side', right: 'Right side', interior: 'Interior', dashboard: 'Dashboard', other: 'Other' };
export const CHECKLIST = {
  documents_in_car: 'RC, insurance & PUC in the car', spare_tyre_and_tools: 'Spare tyre and tools', exterior_clean: 'Exterior clean',
  interior_clean: 'Interior clean', tyres_ok: 'Tyres look OK', lights_ok: 'Lights working', ac_working: 'AC working',
  no_warning_lights: 'No dashboard warning lights', keys_received: 'Keys received',
};
export const TICKET_CATEGORY = { booking: 'Booking', payment: 'Payment', refund: 'Refund', vehicle_issue: 'Car issue', damage_dispute: 'Damage dispute', account: 'Account', kyc: 'Verification', payout: 'Payout', roadside: 'Roadside', other: 'Other' };
export const ROADSIDE = { breakdown: 'Breakdown', flat_tyre: 'Flat tyre', battery: 'Battery', accident: 'Accident', fuel: 'Out of fuel', lockout: 'Locked out', other: 'Other' };
export const fuelLabel = (eighths) => (eighths === 8 ? 'Full' : eighths === 0 ? 'Empty' : `${eighths}/8`);
