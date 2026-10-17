/**
 * Seeds an approved demo host in Indore with listed cars, for testing search and booking.
 * Idempotent: the host is upserted by phone, cars by registration number (MP09ZZ….).
 * Sign in to the vendor app with the OTP dummy number below (static OTP 123456).
 *   npm run db:seed-indore-demo
 */
import { connectDb, disconnectDb } from '../src/core/db.js';
import { City, Brand, Category } from '../src/modules/catalog/catalog.model.js';
import { Vendor, VENDOR_ONBOARDING_STEPS } from '../src/modules/vendors/vendor.model.js';
import { Vehicle } from '../src/modules/vehicles/vehicle.model.js';

const VENDOR_PHONE = '9999900001';
const rupees = (r) => r * 100;
const img = (id) => ({ url: `https://images.unsplash.com/${id}?w=1200&q=80&fm=webp` });
const PHOTOS = [
  'photo-1494976388531-d1058494cdd8', 'photo-1503376780353-7e6692767b70', 'photo-1552519507-da3b142c6e3d',
  'photo-1549317661-bd32c8ce0db2', 'photo-1533473359331-0135ef1b58bf', 'photo-1583121274602-3e2820c69888',
  'photo-1580273916550-e323be2ae537', 'photo-1502877338535-766e1452684a', 'photo-1541899481282-d53bffe3c35d',
  'photo-1511919884226-fd3cad34687c',
];
const photosFor = (i) => [0, 1, 2, 3].map((k) => img(PHOTOS[(i * 3 + k) % PHOTOS.length]));

// Existing admin-created entries are reused by slug; missing ones are added.
const brands = [
  { slug: 'hundai', name: 'Hyundai' },
  { slug: 'maruti-suzuki', name: 'Maruti Suzuki' },
  { slug: 'tata', name: 'Tata' },
  { slug: 'mahindra', name: 'Mahindra' },
  { slug: 'kia', name: 'Kia' },
  { slug: 'toyota', name: 'Toyota' },
];
const categories = [
  { slug: 'sedan', name: 'Sedan', bodyType: 'sedan' },
  { slug: 'hatchback', name: 'Hatchback', bodyType: 'hatchback', description: 'Easy to park, great for the city' },
  { slug: 'compact-suv', name: 'Compact SUV', bodyType: 'compact_suv', description: 'Higher seating, city-friendly size' },
  { slug: 'suv', name: 'SUV', bodyType: 'suv', description: 'Space and road presence for long trips' },
  { slug: 'muv', name: 'MUV', bodyType: 'muv', description: '7-seaters for family and group travel' },
];

// [lng, lat] inside Indore's geofence.
const areas = {
  vijayNagar: { area: 'Vijay Nagar', pincode: '452010', point: [75.8936, 22.7533] },
  palasia: { area: 'New Palasia', pincode: '452001', point: [75.8839, 22.7244] },
  rajwada: { area: 'Rajwada', pincode: '452004', point: [75.8553, 22.7186] },
  bhawarkua: { area: 'Bhawarkua', pincode: '452001', point: [75.8656, 22.6926] },
  sapnaSangeeta: { area: 'Sapna Sangeeta', pincode: '452001', point: [75.8710, 22.7065] },
  superCorridor: { area: 'Super Corridor', pincode: '452005', point: [75.8350, 22.7720] },
  rauCircle: { area: 'Rau', pincode: '453331', point: [75.8120, 22.6500] },
  annapurna: { area: 'Annapurna', pincode: '452009', point: [75.8330, 22.6950] },
};

const cars = [
  { reg: 'MP09ZZ1001', brand: 'maruti-suzuki', cat: 'hatchback', model: 'Swift', variant: 'VXi', year: 2022, color: 'Red', fuel: 'petrol', tx: 'manual', seats: 5, bags: 2, at: 'vijayNagar', hourly: 120, daily: 1800, deposit: 3000, instant: true },
  { reg: 'MP09ZZ1002', brand: 'maruti-suzuki', cat: 'hatchback', model: 'Baleno', variant: 'Zeta AMT', year: 2023, color: 'Blue', fuel: 'petrol', tx: 'automatic', seats: 5, bags: 2, at: 'palasia', hourly: 140, daily: 2100, deposit: 3000 },
  { reg: 'MP09ZZ1003', brand: 'hundai', cat: 'sedan', model: 'Verna', variant: 'SX IVT', year: 2023, color: 'White', fuel: 'petrol', tx: 'automatic', seats: 5, bags: 3, at: 'rajwada', hourly: 200, daily: 3200, deposit: 5000, instant: true, featured: 3 },
  { reg: 'MP09ZZ1004', brand: 'hundai', cat: 'compact-suv', model: 'Creta', variant: 'SX Diesel', year: 2022, color: 'Grey', fuel: 'diesel', tx: 'manual', seats: 5, bags: 3, at: 'bhawarkua', hourly: 220, daily: 3500, deposit: 5000, delivery: true },
  { reg: 'MP09ZZ1005', brand: 'tata', cat: 'compact-suv', model: 'Nexon EV', variant: 'Empowered', year: 2024, color: 'Teal', fuel: 'electric', tx: 'automatic', seats: 5, bags: 2, at: 'sapnaSangeeta', hourly: 210, daily: 3300, deposit: 5000, rangeKm: 465, instant: true, featured: 2 },
  { reg: 'MP09ZZ1006', brand: 'tata', cat: 'hatchback', model: 'Tiago', variant: 'XZ CNG', year: 2023, color: 'Silver', fuel: 'cng', tx: 'manual', seats: 5, bags: 2, at: 'annapurna', hourly: 100, daily: 1500, deposit: 2500 },
  { reg: 'MP09ZZ1007', brand: 'mahindra', cat: 'suv', model: 'XUV700', variant: 'AX7 AT', year: 2023, color: 'Black', fuel: 'diesel', tx: 'automatic', seats: 7, bags: 4, at: 'superCorridor', hourly: 320, daily: 5200, deposit: 10000, delivery: true, featured: 1, luxury: true },
  { reg: 'MP09ZZ1008', brand: 'mahindra', cat: 'suv', model: 'Thar', variant: 'LX 4x4', year: 2022, color: 'Red', fuel: 'diesel', tx: 'manual', seats: 4, bags: 1, at: 'rauCircle', hourly: 280, daily: 4500, deposit: 8000 },
  { reg: 'MP09ZZ1009', brand: 'kia', cat: 'compact-suv', model: 'Sonet', variant: 'HTX', year: 2023, color: 'White', fuel: 'petrol', tx: 'manual', seats: 5, bags: 2, at: 'vijayNagar', hourly: 170, daily: 2700, deposit: 4000 },
  { reg: 'MP09ZZ1010', brand: 'toyota', cat: 'muv', model: 'Innova Crysta', variant: '2.4 GX', year: 2021, color: 'Bronze', fuel: 'diesel', tx: 'manual', seats: 7, bags: 4, at: 'palasia', hourly: 300, daily: 4800, deposit: 8000, delivery: true },
  { reg: 'MP09ZZ1011', brand: 'maruti-suzuki', cat: 'muv', model: 'Ertiga', variant: 'ZXi CNG', year: 2022, color: 'Brown', fuel: 'cng', tx: 'manual', seats: 7, bags: 3, at: 'bhawarkua', hourly: 180, daily: 2800, deposit: 4000 },
  { reg: 'MP09ZZ1012', brand: 'toyota', cat: 'compact-suv', model: 'Urban Cruiser Hyryder', variant: 'V Hybrid', year: 2024, color: 'Blue', fuel: 'hybrid', tx: 'automatic', seats: 5, bags: 3, at: 'superCorridor', hourly: 230, daily: 3600, deposit: 5000, instant: true },
];

await connectDb();
const city = await City.findOne({ slug: 'indore' });
if (!city) {
  console.error('City "indore" not found. Create it in the admin panel first.');
  process.exit(1);
}

const brandIds = {};
for (const [i, b] of brands.entries()) {
  await Brand.updateOne({ slug: b.slug }, { $setOnInsert: { ...b, sortOrder: i } }, { upsert: true });
  brandIds[b.slug] = (await Brand.findOne({ slug: b.slug }).select('_id'))._id;
}
const categoryIds = {};
for (const [i, c] of categories.entries()) {
  await Category.updateOne({ slug: c.slug }, { $setOnInsert: { ...c, sortOrder: i } }, { upsert: true });
  categoryIds[c.slug] = (await Category.findOne({ slug: c.slug }).select('_id'))._id;
}

const now = new Date();
const vendor = await Vendor.findOneAndUpdate(
  { phone: VENDOR_PHONE },
  { $set: {
    name: 'Indore Demo Host',
    email: 'demo.host.indore@way2cars.test',
    businessType: 'individual',
    businessName: 'Indore Self Drive (Demo)',
    address: { line1: '12, Scheme 54, Vijay Nagar', city: 'Indore', state: 'Madhya Pradesh', pincode: '452010', location: { type: 'Point', coordinates: areas.vijayNagar.point } },
    cityId: city._id,
    status: 'approved',
    completedSteps: VENDOR_ONBOARDING_STEPS,
    submittedAt: now,
    reviewedAt: now,
    'kyc.status': 'approved',
    'kyc.submittedAt': now,
    'kyc.reviewedAt': now,
    rating: { avg: 4.6, count: 18 },
  } },
  { upsert: true, new: true, runValidators: true },
);

const inYears = (n) => new Date(now.getFullYear() + n, now.getMonth(), now.getDate());
for (const [i, c] of cars.entries()) {
  const a = areas[c.at];
  const doc = {
    vendorId: vendor._id,
    cityId: city._id,
    brandId: brandIds[c.brand],
    categoryId: categoryIds[c.cat],
    model: c.model,
    variant: c.variant,
    year: c.year,
    registrationNumber: c.reg,
    color: c.color,
    fuelType: c.fuel,
    transmission: c.tx,
    seats: c.seats,
    luggageBags: c.bags,
    ...(c.rangeKm ? { rangeKm: c.rangeKm } : {}),
    features: ['ac', 'bluetooth', 'airbags', 'abs', 'power_windows', 'usb_charger', 'fastag', 'spare_tyre', ...(c.tx === 'automatic' ? ['push_start', 'android_auto', 'apple_carplay', 'reverse_camera'] : ['music_system'])],
    description: `Demo listing: well-maintained ${c.model} ${c.variant} available for self-drive in ${a.area}, Indore. Sanitised before every trip.`,
    photos: photosFor(i),
    documents: {
      rc: { number: c.reg, expiry: inYears(10) },
      insurance: { number: `DEMO-INS-${c.reg}`, provider: 'Demo General Insurance', type: 'comprehensive', expiry: inYears(1) },
      puc: { number: `DEMO-PUC-${c.reg}`, expiry: inYears(1) },
    },
    location: { address: `${a.area}, Indore, Madhya Pradesh, India`, area: a.area, pincode: a.pincode, point: { type: 'Point', coordinates: a.point } },
    pricing: {
      hourlyPaise: rupees(c.hourly),
      dailyPaise: rupees(c.daily),
      weekendDailyPaise: rupees(Math.round(c.daily * 1.15)),
      securityDepositPaise: rupees(c.deposit),
      includedKmPerDay: 300,
      extraKmChargePaise: rupees(c.daily >= 4000 ? 15 : 10),
    },
    delivery: { enabled: !!c.delivery, maxKm: 15 },
    instantBooking: !!c.instant,
    isLuxury: !!c.luxury,
    isFeatured: !!c.featured,
    featuredRank: c.featured || 0,
    adminSuspended: false,
    approval: { status: 'approved', submittedAt: now, reviewedAt: now },
    status: 'active',
    isListed: true,
    rating: { avg: 4 + ((i * 7) % 10) / 10, count: 3 + i * 2 },
  };
  await Vehicle.updateOne({ registrationNumber: c.reg }, { $set: doc }, { upsert: true, runValidators: true });
}

console.log(`Vendor ${VENDOR_PHONE} (${vendor._id}) approved in Indore with ${cars.length} listed cars.`);
await disconnectDb();
