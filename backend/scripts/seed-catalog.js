/**
 * Seeds reference data: cities, brands, categories, FAQs and DRAFT CMS pages.
 * Idempotent (upserts by slug). Legal pages are clearly marked as drafts that must be replaced
 * with text approved by WAY2CARS' legal counsel before launch.
 */
import { connectDb, disconnectDb } from '../src/core/db.js';
import { City, Brand, Category } from '../src/modules/catalog/catalog.model.js';
import { CmsPage, Faq } from '../src/modules/cms/cms.model.js';

const cities = [
  { name: 'Pune', slug: 'pune', state: 'Maharashtra', gstStateCode: '27', lat: 18.5204, lng: 73.8567, serviceRadiusKm: 35, isPopular: true, sortOrder: 1 },
  { name: 'Mumbai', slug: 'mumbai', state: 'Maharashtra', gstStateCode: '27', lat: 19.076, lng: 72.8777, serviceRadiusKm: 45, isPopular: true, sortOrder: 2 },
  { name: 'Bengaluru', slug: 'bengaluru', state: 'Karnataka', gstStateCode: '29', lat: 12.9716, lng: 77.5946, serviceRadiusKm: 40, isPopular: true, sortOrder: 3 },
  { name: 'Hyderabad', slug: 'hyderabad', state: 'Telangana', gstStateCode: '36', lat: 17.385, lng: 78.4867, serviceRadiusKm: 40, isPopular: true, sortOrder: 4 },
  { name: 'Delhi NCR', slug: 'delhi-ncr', state: 'Delhi', gstStateCode: '07', lat: 28.6139, lng: 77.209, serviceRadiusKm: 50, isPopular: true, sortOrder: 5 },
  { name: 'Chennai', slug: 'chennai', state: 'Tamil Nadu', gstStateCode: '33', lat: 13.0827, lng: 80.2707, serviceRadiusKm: 35, sortOrder: 6 },
  { name: 'Ahmedabad', slug: 'ahmedabad', state: 'Gujarat', gstStateCode: '24', lat: 23.0225, lng: 72.5714, serviceRadiusKm: 30, sortOrder: 7 },
  { name: 'Jaipur', slug: 'jaipur', state: 'Rajasthan', gstStateCode: '08', lat: 26.9124, lng: 75.7873, serviceRadiusKm: 30, sortOrder: 8 },
];
const brands = ['Maruti Suzuki', 'Hyundai', 'Tata', 'Mahindra', 'Kia', 'Toyota', 'Honda', 'MG', 'Skoda', 'Volkswagen', 'Renault', 'Nissan', 'Citroen', 'BYD', 'BMW', 'Mercedes-Benz', 'Audi', 'Jeep'];
const categories = [
  { name: 'Hatchback', slug: 'hatchback', bodyType: 'hatchback', description: 'Easy to park, great for the city', isPopular: true, sortOrder: 1 },
  { name: 'Sedan', slug: 'sedan', bodyType: 'sedan', description: 'Comfortable highway cruisers', isPopular: true, sortOrder: 2 },
  { name: 'Compact SUV', slug: 'compact-suv', bodyType: 'compact_suv', description: 'Higher seating, city-friendly size', isPopular: true, sortOrder: 3 },
  { name: 'SUV', slug: 'suv', bodyType: 'suv', description: 'Space and road presence for long trips', isPopular: true, sortOrder: 4 },
  { name: 'MUV', slug: 'muv', bodyType: 'muv', description: '7-seaters for family and group travel', isPopular: true, sortOrder: 5 },
];
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const DRAFT = { type: 'paragraph', text: 'DRAFT — this text is a placeholder for review by WAY2CARS legal counsel and must be replaced before launch.' };
const pages = {
  'rental-agreement': { title: 'Self-Drive Rental Agreement', blocks: [DRAFT,
    { type: 'heading', text: '1. Parties and vehicle' },
    { type: 'paragraph', text: 'This agreement is between the renter named in the booking, the host who owns the vehicle, and WAY2CARS Technology Pvt Ltd as the platform operator, for the vehicle and period shown in the booking summary.' },
    { type: 'heading', text: '2. Renter obligations' },
    { type: 'list', items: ['Hold a valid Indian driving licence for the vehicle class for the entire trip.', 'Only the verified renter may drive the vehicle.', 'Do not drive under the influence of alcohol or drugs, or use the vehicle for commercial hire, racing or towing.', 'Obey traffic laws; fines and challans during the trip are the renter’s responsibility.', 'Return the vehicle on time, at the agreed location, with the same fuel level.'] },
    { type: 'heading', text: '3. Charges and security deposit' },
    { type: 'paragraph', text: 'Extra kilometres beyond the included allowance, fuel shortfall, late return and approved damage charges are deducted from the refundable security deposit. Amounts exceeding the deposit are payable by the renter.' },
    { type: 'heading', text: '4. Damage, accidents and breakdowns' },
    { type: 'paragraph', text: 'Report any accident, damage or breakdown immediately through the app’s roadside assistance. Pickup and return photos form the condition record of the vehicle.' }] },
  'privacy-policy': { title: 'Privacy Policy', blocks: [DRAFT, { type: 'paragraph', text: 'Describe what personal data WAY2CARS collects (identity documents, phone number, location during trips, payment references), why, how long it is kept, and how users can request access or deletion.' }] },
  'terms-and-conditions': { title: 'Terms & Conditions', blocks: [DRAFT, { type: 'paragraph', text: 'Platform terms of use for renters and hosts.' }] },
  'cancellation-policy': { title: 'Cancellation Policy', blocks: [DRAFT, { type: 'list', items: ['Free cancellation up to 24 hours before pickup.', '50% of trip charges refunded between 24 and 6 hours before pickup.', 'No refund of trip charges within 6 hours of pickup.', 'The security deposit is always refunded in full on cancellation.'] }] },
  'host-terms': { title: 'Host Terms', blocks: [DRAFT, { type: 'paragraph', text: 'Terms for listing vehicles, commission, payouts and host responsibilities.' }] },
  'about-us': { title: 'About WAY2CARS', blocks: [{ type: 'paragraph', text: 'WAY2CARS Technology Pvt Ltd connects travellers with verified car owners for self-drive rentals.' }] },
  'contact-us': { title: 'Contact Us', blocks: [{ type: 'paragraph', text: 'Use Help & Support in the app to chat with us or raise a ticket. Our team is available 24×7 for trips in progress.' }] },
};
const faqs = [
  { audience: 'user', category: 'Booking', question: 'What documents do I need to book?', answer: 'A valid Indian driving licence and a government ID (Aadhaar, passport or voter ID), plus a selfie for verification. Verification is usually completed within a few hours.' },
  { audience: 'user', category: 'Booking', question: 'Is fuel included?', answer: 'No. Return the car with the same fuel level as at pickup. Any shortfall is charged per the rate shown at booking.' },
  { audience: 'user', category: 'Payments', question: 'When do I get my security deposit back?', answer: 'After the host confirms the return, the deposit minus any extra-kilometre, fuel, late-return or approved damage charges is refunded to your original payment method. Banks take 5–7 working days.' },
  { audience: 'user', category: 'Trip', question: 'What if the car breaks down?', answer: 'Open your trip and tap Roadside assistance. Our team is notified immediately and will call you.' },
  { audience: 'vendor', category: 'Earnings', question: 'When can I withdraw my earnings?', answer: 'Trip earnings become available a few days after the trip is completed. You can then request a withdrawal to your verified bank account.' },
  { audience: 'vendor', category: 'Listing', question: 'Why does my car need approval?', answer: 'We verify the RC, insurance and pollution certificate and the listing photos before a car goes live, to protect you and renters.' },
];

await connectDb();
for (const c of cities) {
  const { lat, lng, ...rest } = c;
  await City.updateOne({ slug: c.slug }, { $setOnInsert: { ...rest, center: { type: 'Point', coordinates: [lng, lat] } } }, { upsert: true });
}
for (const [i, name] of brands.entries()) await Brand.updateOne({ slug: slugify(name) }, { $setOnInsert: { name, slug: slugify(name), sortOrder: i } }, { upsert: true });
for (const c of categories) await Category.updateOne({ slug: c.slug }, { $setOnInsert: c }, { upsert: true });
for (const [slug, p] of Object.entries(pages)) await CmsPage.updateOne({ slug }, { $setOnInsert: { slug, ...p } }, { upsert: true });
if (!(await Faq.estimatedDocumentCount())) await Faq.insertMany(faqs.map((f, i) => ({ ...f, sortOrder: i })));
console.log(`Seeded ${cities.length} cities, ${brands.length} brands, ${categories.length} categories, ${Object.keys(pages).length} CMS pages, FAQs.`);
await disconnectDb();
