import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Menu, Phone, X } from 'lucide-react';
import MARK from '@shared/assets/mark.png';

const PHONE = '8105997555';
const PHONE_DISPLAY = '81059 97555';
const EMAIL = 'way2carstechnology@gmail.com';
const page = (slug) => `/user/pages/${slug}`;

const NAV = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#fleet', label: 'Our cars' },
  { href: '#hosts', label: 'For owners' },
  { href: '#policies', label: 'Policies' },
];

const STEPS = [
  {
    title: 'Verify once',
    body: 'Sign in with your mobile number, then upload your driving licence and ID. You only do this once. After that, booking takes a couple of minutes.',
  },
  {
    title: 'Book and pay',
    body: 'Choose hours or days and a kilometre package. You see the rental, taxes, security deposit and extra-km rate before you pay.',
  },
  {
    title: 'Pick up',
    body: 'We go round the car with you and photograph it. Odometer and fuel are recorded, so you never pay for damage you didn’t cause.',
  },
  {
    title: 'Return',
    body: 'Bring the car back on time to the agreed spot. After the return inspection, whatever you don’t owe from your deposit comes straight back.',
  },
];

const POLICIES = [
  {
    label: 'Cancellation',
    value: '50% back',
    note: 'if you cancel 48 hours or more before pickup. Inside 48 hours, the booking amount isn’t refunded.',
    href: page('cancellation-policy'),
  },
  {
    label: 'Security deposit',
    value: 'Refundable',
    note: 'Deductions only for damage, missing items or dues we can show you evidence for. Normal wear and tear is never charged.',
    href: page('terms-and-conditions'),
  },
  {
    label: 'If we cancel',
    value: 'Full refund',
    note: 'If we cancel because a car is unavailable, you can take a replacement car or a full refund of what you paid.',
    href: page('cancellation-policy'),
  },
];

function Plate({ tone, children }) {
  const black = tone === 'black';
  return (
    <div
      className={`inline-flex shrink-0 items-stretch self-start overflow-hidden whitespace-nowrap rounded-[6px] border-2 font-mono text-[15px] font-bold tracking-[0.12em] sm:text-[17px] ${
        black ? 'border-ink-950 bg-ink-950 text-[#F2C230]' : 'border-ink-900 bg-white text-ink-950'
      }`}
    >
      <span className="flex flex-col items-center justify-center bg-[#1F4FA3] px-1.5 text-[8px] font-bold leading-none tracking-normal text-white">
        <span className="mb-0.5 h-1.5 w-1.5 rounded-full bg-white/80" />
        IND
      </span>
      <span className="px-3 py-1.5">{children}</span>
    </div>
  );
}

function SectionHead({ kicker, title, children }) {
  return (
    <div className="max-w-2xl">
      <p className="text-label font-semibold text-brand-600">{kicker}</p>
      <h2 className="mt-2 text-[28px] font-extrabold leading-[34px] tracking-tight text-ink-950 sm:text-[36px] sm:leading-[42px]">{title}</h2>
      {children && <p className="mt-3 text-body text-ink-600">{children}</p>}
    </div>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-canvas/90 backdrop-blur supports-[backdrop-filter]:bg-canvas/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <a href="/" className="flex items-center gap-2" aria-label="Way2Cars home">
          <img src={MARK} alt="" width="58" height="24" className="h-6 w-auto" />
          <span className="text-[17px] font-extrabold tracking-wide text-ink-950">WAY2CARS</span>
        </a>
        <nav className="ml-4 hidden items-center gap-6 md:flex" aria-label="Main">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="text-bodySm font-semibold text-ink-600 transition-colors hover:text-ink-950">{n.label}</a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <a href={`tel:+91${PHONE}`} className="hidden items-center gap-2 px-2 text-bodySm font-semibold text-ink-800 hover:text-brand-600 lg:inline-flex">
            <Phone size={16} aria-hidden /> {PHONE_DISPLAY}
          </a>
          <a href="/user" data-testid="entry-user-header" className="hidden h-10 items-center rounded-md bg-ink-950 px-4 text-label font-semibold text-white transition-colors hover:bg-brand-700 sm:inline-flex">
            Book a car
          </a>
          <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-800 md:hidden" aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-line bg-surface px-4 pb-4 md:hidden" aria-label="Mobile">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="block border-b border-line py-3 text-body font-semibold text-ink-800">{n.label}</a>
          ))}
          <a href={`tel:+91${PHONE}`} className="mt-3 flex items-center gap-2 py-2 text-body font-semibold text-ink-800"><Phone size={16} aria-hidden /> {PHONE_DISPLAY}</a>
          <a href="/user" className="mt-2 flex h-11 items-center justify-center rounded-md bg-ink-950 text-label font-semibold text-white">Book a car</a>
        </nav>
      )}
    </header>
  );
}

/** Public landing page at "/". Links into the renter (/user) and host (/vendor) web apps. */
export default function Landing() {
  useEffect(() => {
    document.title = 'Way2Cars — Self-drive car rental in Hyderabad';
  }, []);

  return (
    <div className="min-h-[100dvh] bg-canvas font-sans text-ink-900 antialiased">
      <Header />

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-16 lg:pb-24 lg:pt-20">
          <div>
            <p className="text-label font-semibold text-ink-500">Self-drive car rental · Hyderabad</p>
            <h1 className="mt-4 text-[38px] font-extrabold leading-[1.08] tracking-[-0.02em] text-ink-950 sm:text-[54px]">
              Your car for the weekend, without the paperwork drama.
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-[27px] text-ink-600">
              Book a verified self-drive car by the hour or the day. Every charge is shown before you pay, the car is inspected with you at pickup, and your deposit comes back after return.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="/user" data-testid="entry-user" className="group inline-flex h-12 items-center justify-center gap-2 rounded-md bg-brand-500 px-6 text-[15px] font-semibold text-white transition-colors hover:bg-brand-600">
                Find a car
                <ArrowRight size={18} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
              </a>
              <a href="/vendor" data-testid="entry-vendor" className="inline-flex h-12 items-center justify-center rounded-md border border-ink-300 bg-surface px-6 text-[15px] font-semibold text-ink-900 transition-colors hover:border-ink-900">
                List your car
              </a>
            </div>
            <p className="mt-6 text-bodySm text-ink-500">
              Questions before you book? Call <a href={`tel:+91${PHONE}`} className="font-semibold text-ink-800 underline decoration-ink-300 underline-offset-4 hover:decoration-ink-800">{PHONE_DISPLAY}</a>
            </p>
          </div>

          {/* Booking summary card: what a renter actually sees before paying */}
          <div className="relative">
            <div className="absolute -inset-x-4 -inset-y-6 -z-0 rounded-[28px] bg-gradient-to-br from-brand-100 via-accent-50 to-transparent sm:-inset-x-8" aria-hidden />
            <div className="relative rounded-2xl border border-line bg-surface p-5 shadow-raised sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-caption font-semibold uppercase tracking-wider text-ink-500">Before you pay</p>
                  <p className="mt-1 text-headline font-bold text-ink-950">Your booking summary</p>
                </div>
                <div className="hidden min-[400px]:block"><Plate tone="black">TS 08 W2 2026</Plate></div>
              </div>
              <dl className="mt-5 divide-y divide-line border-y border-line text-bodySm">
                {[
                  ['Pickup', 'Sat, 10:00 AM · Bachupally'],
                  ['Return', 'Mon, 10:00 AM · Bachupally'],
                  ['Kilometre package', 'Shown with the price'],
                  ['Taxes', 'Included in the total'],
                  ['Security deposit', 'Refundable after return'],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-ink-500">{k}</dt>
                    <dd className="text-right font-semibold text-ink-900">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-caption leading-5 text-ink-500">Shown on every booking: car, registration number, approved drivers, charges, deposit and cancellation terms. Nothing gets added at the counter.</p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-20 border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
            <SectionHead kicker="How a trip works" title="Four steps, and you’re told what happens at each one." />
            <ol className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative border-t-2 border-ink-950 pt-5">
                  <span className="font-mono text-caption font-bold text-ink-400">0{i + 1}</span>
                  <h3 className="mt-2 text-headline font-bold text-ink-950">{s.title}</h3>
                  <p className="mt-2 text-bodySm leading-[22px] text-ink-600">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Two kinds of cars */}
        <section id="fleet" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
            <SectionHead kicker="Our cars" title="Two kinds of cars. Your booking always says which one you’re getting.">
              Every listing shows the registration number, who the owner is and how the car can be used, before you confirm.
            </SectionHead>
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              <article className="flex flex-col rounded-2xl bg-ink-950 p-6 text-white sm:p-8">
                <Plate tone="black">TS 08 W2 2026</Plate>
                <h3 className="mt-6 text-title font-bold">Company fleet</h3>
                <p className="mt-2 text-bodySm leading-[22px] text-ink-300">
                  Black-plate cars that Way2Cars owns or leases. We handle maintenance, insurance and paperwork. A car only goes out once its permit and documents allow self-drive use.
                </p>
              </article>
              <article className="flex flex-col rounded-2xl border border-line bg-surface p-6 sm:p-8">
                <Plate tone="white">TS 09 EK 4417</Plate>
                <h3 className="mt-6 text-title font-bold text-ink-950">Owner cars</h3>
                <p className="mt-2 text-bodySm leading-[22px] text-ink-600">
                  Cars from independent owners. We check the RC, insurance and permitted use, and approve every listing first. If a car doesn’t qualify, it doesn’t go live.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* Hosts */}
        <section id="hosts" className="scroll-mt-20 bg-brand-900 text-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-24">
            <div>
              <p className="text-label font-semibold text-accent-300">For car owners</p>
              <h2 className="mt-2 text-[28px] font-extrabold leading-[34px] tracking-tight sm:text-[36px] sm:leading-[42px]">Your car sits idle most of the week. Let it earn.</h2>
              <p className="mt-4 max-w-lg text-body text-brand-100">
                List your car with Way2Cars and rent it to verified drivers. We take care of bookings, payments, inspections and support. Your payout terms are set out in a written host agreement.
              </p>
              <a href="/vendor" className="group mt-8 inline-flex h-12 items-center gap-2 rounded-md bg-white px-6 text-[15px] font-semibold text-brand-900 transition-colors hover:bg-brand-50">
                Start hosting
                <ArrowRight size={18} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
              </a>
            </div>
            <ul className="grid gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-2">
              {[
                ['Verified renters', 'Licence, ID and selfie checks before anyone gets your keys.'],
                ['Recorded handovers', 'Photos, odometer and fuel at pickup and return, for every trip.'],
                ['Clear payouts', 'Fees, deductions and payout cycle written into your agreement.'],
                ['You stay the owner', 'Listing doesn’t transfer ownership. You can pause your car whenever you like.'],
              ].map(([t, b]) => (
                <li key={t} className="bg-brand-900 p-5 sm:p-6">
                  <p className="font-bold">{t}</p>
                  <p className="mt-1.5 text-bodySm text-brand-200">{b}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Policies */}
        <section id="policies" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
            <SectionHead kicker="Policies, in plain words" title="Know the rules before you book.">
              Here’s the short version. The full documents are linked from each card and at the bottom of this page.
            </SectionHead>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {POLICIES.map((p) => (
                <a key={p.label} href={p.href} className="group flex flex-col rounded-2xl border border-line bg-surface p-6 transition hover:border-ink-300 hover:shadow-card">
                  <p className="text-label font-semibold text-ink-500">{p.label}</p>
                  <p className="mt-3 text-[26px] font-extrabold tracking-tight text-ink-950">{p.value}</p>
                  <p className="mt-2 flex-1 text-bodySm leading-[22px] text-ink-600">{p.note}</p>
                  <span className="mt-5 inline-flex items-center gap-1 text-label font-semibold text-brand-600">
                    Read the policy <ArrowUpRight size={15} aria-hidden className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:pb-24">
          <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-line bg-surface p-6 sm:p-10 md:flex-row md:items-center">
            <div>
              <h2 className="text-[24px] font-extrabold leading-tight tracking-tight text-ink-950 sm:text-[28px]">Planning a trip? Check which cars are free for your dates.</h2>
              <p className="mt-2 text-body text-ink-600">Signing in only takes your mobile number.</p>
            </div>
            <a href="/user" className="group inline-flex h-12 shrink-0 items-center gap-2 rounded-md bg-ink-950 px-6 text-[15px] font-semibold text-white transition-colors hover:bg-brand-700">
              See available cars
              <ArrowRight size={18} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 text-bodySm sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2">
              <img src={MARK} alt="" width="58" height="24" className="h-6 w-auto" />
              <span className="text-[16px] font-extrabold tracking-wide text-ink-950">WAY2CARS</span>
            </div>
            <p className="mt-3 max-w-xs text-ink-500">Way2Cars Technology Private Limited. Your journey, your way.</p>
          </div>
          <div>
            <p className="font-bold text-ink-900">Contact</p>
            <ul className="mt-3 space-y-2 text-ink-600">
              <li><a href={`tel:+91${PHONE}`} className="hover:text-ink-950">{PHONE_DISPLAY}</a></li>
              <li><a href={`mailto:${EMAIL}`} className="break-all hover:text-ink-950">{EMAIL}</a></li>
              <li><a href={page('contact-us')} className="hover:text-ink-950">Contact page</a></li>
            </ul>
          </div>
          <div>
            <p className="font-bold text-ink-900">Offices</p>
            <address className="mt-3 not-italic leading-[20px] text-ink-600">
              <span className="block text-caption font-semibold uppercase tracking-wider text-ink-400">Operations</span>
              Miyapur Main Road, behind Hamara Family Restaurant, Bachupally, Hyderabad 500043
              <span className="mt-3 block text-caption font-semibold uppercase tracking-wider text-ink-400">Registered</span>
              14-38, Adharsha Nagar, Bachannapet, Jangaon, Telangana 506221
            </address>
          </div>
          <div>
            <p className="font-bold text-ink-900">Company</p>
            <ul className="mt-3 space-y-2 text-ink-600">
              <li><a href={page('about-us')} className="hover:text-ink-950">About us</a></li>
              <li><a href={page('terms-and-conditions')} className="hover:text-ink-950">Terms &amp; conditions</a></li>
              <li><a href={page('privacy-policy')} className="hover:text-ink-950">Privacy policy</a></li>
              <li><a href={page('cancellation-policy')} className="hover:text-ink-950">Cancellation &amp; refunds</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-caption text-ink-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span>© {new Date().getFullYear()} Way2Cars Technology Private Limited</span>
            <span>Grievance Officer: Kurella Venkatesh · {EMAIL}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
