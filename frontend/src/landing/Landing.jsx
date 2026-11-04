import { ArrowRight, ArrowUpRight, BadgeCheck, Camera, ChevronDown, FileCheck2, IdCard, MessageCircle, Phone, ScanFace, ShieldAlert, Smartphone, Wrench } from 'lucide-react';
import { BodySilhouette, HANDOVER_POINTS, HandoverDrawing, Plate } from './art';
import { COMPANY, EMAIL, OFFICES, PHONE_DISPLAY, SiteFooter, SiteHeader, TEL, usePageMeta } from './site';

const HERO_FACTS = [
  ['Hours or days', 'Rent for as long as your trip needs'],
  ['Shown before you pay', 'Charges, taxes, deposit and extra-km rate'],
  ['Recorded handover', 'Photos, odometer and fuel at both ends'],
  ['Refundable deposit', 'Deductions need evidence behind them'],
];

const STEPS = [
  { title: 'Verify', body: 'Sign in with your mobile number, then upload your driving licence and ID and take a selfie. Verification is usually done within a few hours.' },
  { title: 'Book and pay', body: 'Choose hours or days and a kilometre package. You see the rental, taxes, security deposit and extra-km rate before you confirm.' },
  { title: 'Pick up', body: 'Go round the car with us and photograph it. Odometer and fuel are recorded, so existing damage is on file from the start.' },
  { title: 'Drive', body: 'Booking details and updates reach you on WhatsApp and in the app. Need more time? Ask us for an extension before your return time.' },
  { title: 'Return', body: 'Bring the car back to the agreed spot on time. After the return inspection, your deposit is refunded less anything properly owed.' },
];

const BODY_TYPES = [
  { type: 'hatchback', name: 'Hatchback', note: 'Easy to park, great for the city' },
  { type: 'sedan', name: 'Sedan', note: 'Comfortable highway cruisers' },
  { type: 'compactSuv', name: 'Compact SUV', note: 'Higher seating, city-friendly size' },
  { type: 'suv', name: 'SUV', note: 'Space and presence for long trips' },
  { type: 'muv', name: 'MUV', note: '7-seaters for family and group travel' },
];

const CHARGES = [
  ['Vehicle rental', 'Every booking', 'For your hours or days and km package'],
  ['GST and taxes', 'Every booking', 'Shown in your total'],
  ['Platform or service fee', 'If applicable', 'Shown before payment'],
  ['Security deposit', 'Refundable', 'Amount and payment method in your booking'],
  ['Delivery or pickup', 'If you choose it', 'Priced in your booking details'],
  ['Extra kilometres', 'Only if you go over', 'At the rate shown before you confirm'],
  ['Late return', 'Only if you are late', 'As set out in your booking confirmation'],
];

const REQUIREMENTS = [
  { icon: BadgeCheck, title: 'Age 18 or over', body: 'Some cars or insurance policies may set a higher minimum age. If so, your booking will say.' },
  { icon: IdCard, title: 'A valid driving licence', body: 'It must cover the class of car you book. Additional drivers need approval in the booking documents too.' },
  { icon: FileCheck2, title: 'Identity and address proof', body: 'Genuine, current documents. We ask only for what is reasonably needed for verification and safety.' },
  { icon: ScanFace, title: 'A quick selfie', body: 'This confirms the person booking is the person on the licence. Accounts and licences can’t be shared.' },
  { icon: Smartphone, title: 'Your contact details', body: 'A working mobile number and email address, along with an emergency contact.' },
];

const ROADSIDE = [
  { icon: ShieldAlert, title: 'Get safe first', body: 'After an accident, theft or fire, make sure everyone is safe and call emergency services if needed.' },
  { icon: Phone, title: 'Then call us', body: `Ring ${PHONE_DISPLAY} straight away and share photos and details of what happened.` },
  { icon: Wrench, title: 'We coordinate the next step', body: 'For a breakdown, we or the owner arrange assistance, inspection, repair or a replacement as appropriate.' },
];

const HOST_POINTS = [
  ['Verified renters', 'Licence, ID and selfie checks before anyone gets your keys.'],
  ['Recorded handovers', 'Photos, odometer and fuel at pickup and return, for every trip.'],
  ['Clear payouts', 'Fees, deductions and payment cycle are written into your Host Agreement.'],
  ['You stay the owner', 'Listing your car on Way2Cars doesn’t transfer ownership.'],
];

const POLICIES = [
  { label: 'If you cancel', value: '50% back', note: 'of the booking amount when you cancel 48 hours or more before pickup. Inside 48 hours, there’s no refund.', href: '/cancellation-policy' },
  { label: 'If we cancel', value: 'Refund or swap', note: 'If we cancel a confirmed booking, you’re offered a suitable alternative or a full refund of what you paid for it.', href: '/cancellation-policy' },
  { label: 'Security deposit', value: 'Refundable', note: 'Deductions only for amounts properly payable, like substantiated damage or unpaid charges. Never for normal wear and tear.', href: '/terms-and-conditions#12-security-deposit' },
];

const FAQS = [
  ['What do I need to book?', 'A valid driving licence for the class of car, a government ID, address proof where required, and a selfie for verification. Verification is usually completed within a few hours.'],
  ['Is fuel included?', 'Fuel and charging responsibilities are set out in your booking details. Any fuel charge has to be backed by those booking terms and reasonable records, so check the odometer and fuel level with us at handover and return.'],
  ['How do kilometre packages work?', 'Your booking confirmation says whether the package is limited or unlimited. On a limited package, extra kilometres are charged only at the rate shown before you confirmed.'],
  ['When do I get my deposit back?', 'After the return inspection and once any dues or legitimate deductions are settled. It goes to your original payment method or another verified method agreed with you, and timing also depends on the payment provider.'],
  ['Can a friend or family member drive?', 'Only if they are approved as an additional driver in the booking documents and meet the same licence, age, verification and insurance requirements.'],
  ['What if I need the car for longer?', 'Contact us as soon as you expect a delay and request an extension. It only counts once we expressly approve it, and an unapproved extension can affect insurance and lead to extra charges.'],
  ['Are the cars tracked?', 'Certain cars may have GPS, telematics or a dashcam for security, safety and emergency response. Where monitoring is used, you’ll be told about it. These devices must not be removed or disabled.'],
  ['What can’t I use the car for?', 'Racing, driving under the influence, taxi or delivery work unless legally permitted for that car, re-renting it to someone else, or leaving the approved operating area without written permission. The Terms have the full list.'],
];

const shell = 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-8';
const sectionPad = 'py-16 sm:py-20 lg:py-28';

function SectionHead({ kicker, title, children, light, className = 'max-w-3xl' }) {
  return (
    <div className={className}>
      <p className={`text-label font-bold ${light ? 'text-accent-300' : 'text-brand-600'}`}>{kicker}</p>
      <h2 className={`mt-3 text-[30px] font-extrabold leading-[1.15] tracking-[-0.02em] sm:text-[40px] lg:text-[46px] ${light ? 'text-white' : 'text-ink-950'}`}>{title}</h2>
      {children && <p className={`mt-4 max-w-2xl text-[16px] leading-[26px] lg:text-[17px] lg:leading-[28px] ${light ? 'text-brand-100' : 'text-ink-600'}`}>{children}</p>}
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-brand-900 text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '56px 56px' }}
        aria-hidden
      />
      <div className={`relative ${shell} grid gap-12 pb-14 pt-12 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:items-center lg:gap-14 lg:pb-20 lg:pt-20`}>
        <div>
          <p className="inline-flex items-center gap-2 text-label font-bold text-accent-200">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-300" aria-hidden />
            Self-drive car rental in Hyderabad
          </p>
          <h1 className="mt-5 text-[40px] font-extrabold leading-[1.06] tracking-[-0.03em] sm:text-[56px] xl:text-[66px]">
            Your car for the weekend, without the paperwork drama.
          </h1>
          <p className="mt-6 max-w-xl text-[17px] leading-[28px] text-brand-100 lg:text-[18px] lg:leading-[30px]">
            Book a verified self-drive car by the hour or the day. Every charge is shown before you pay, and the car’s condition is recorded with you at pickup.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a href="/user" data-testid="entry-user" className="group inline-flex h-[52px] items-center justify-center gap-2 rounded-md bg-white px-7 text-[15px] font-bold text-brand-900 transition-colors hover:bg-brand-50">
              Find a car
              <ArrowRight size={18} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
            </a>
            <a href="/vendor" data-testid="entry-vendor" className="inline-flex h-[52px] items-center justify-center rounded-md border border-white/30 px-7 text-[15px] font-bold text-white transition-colors hover:border-white hover:bg-white/5">
              List your car
            </a>
          </div>
          <p className="mt-6 text-bodySm text-brand-200">
            Questions first? Call <a href={TEL} className="font-bold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white">{PHONE_DISPLAY}</a>
          </p>
        </div>

        <figure className="rounded-2xl border border-white/15 bg-brand-800/70 p-4 backdrop-blur-sm sm:p-6 lg:p-7">
          <figcaption className="flex items-center justify-between gap-4 border-b border-white/15 pb-4">
            <span className="text-bodySm font-bold">Your handover sheet</span>
            <span className="inline-flex items-center gap-1.5 text-caption font-semibold text-accent-200"><Camera size={14} aria-hidden /> Pickup and return</span>
          </figcaption>
          <HandoverDrawing className="mt-5 w-full text-brand-100" />
          <ol className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {HANDOVER_POINTS.map((p, i) => (
              <li key={p.label} className="flex items-center gap-3 text-bodySm text-brand-50">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-300 text-caption font-extrabold text-brand-900">{i + 1}</span>
                {p.label}
              </li>
            ))}
          </ol>
        </figure>
      </div>

      <div className="relative border-t border-white/10">
        <dl className={`${shell} grid grid-cols-2 gap-x-6 gap-y-7 py-8 lg:grid-cols-4 lg:gap-x-10`}>
          {HERO_FACTS.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[15px] font-bold text-white lg:text-[17px]">{k}</dt>
              <dd className="mt-1 text-caption leading-[18px] text-brand-200 lg:text-bodySm">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 bg-surface">
      <div className={`${shell} ${sectionPad}`}>
        <SectionHead kicker="How a trip works" title="Five steps, from first sign-in to deposit refund." />
        <ol className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:mt-16 lg:grid-cols-5 lg:gap-x-7">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative border-l-2 border-brand-500 pl-5 lg:border-l-0 lg:border-t-2 lg:pl-0 lg:pt-6">
              <span className="font-mono text-caption font-bold text-brand-600">0{i + 1}</span>
              <h3 className="mt-2 text-[20px] font-extrabold tracking-tight text-ink-950">{s.title}</h3>
              <p className="mt-2.5 text-bodySm leading-[22px] text-ink-600">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Cars() {
  return (
    <section id="cars" className="scroll-mt-20">
      <div className={`${shell} ${sectionPad}`}>
        <SectionHead kicker="Our cars" title="From a city hatchback to a 7-seater for the whole family.">
          Which cars you can book depends on your dates. Sign in to see what’s free.
        </SectionHead>
        <ul className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3 lg:mt-14 lg:grid-cols-5">
          {BODY_TYPES.map((b) => (
            <li key={b.type} className="bg-surface p-5 last:col-span-2 md:last:col-span-1 lg:p-6">
              <BodySilhouette type={b.type} className="h-auto w-full max-w-[190px] text-brand-500" />
              <h3 className="mt-5 text-[16px] font-extrabold text-ink-950">{b.name}</h3>
              <p className="mt-1 text-caption leading-[18px] text-ink-500">{b.note}</p>
            </li>
          ))}
        </ul>

        <h3 className="mt-16 text-[22px] font-extrabold tracking-tight text-ink-950 lg:mt-20 lg:text-[26px]">Two kinds of car. Your booking always says which one you’re getting.</h3>
        <div className="mt-7 grid gap-5 md:grid-cols-2">
          <article className="flex flex-col rounded-2xl bg-ink-950 p-6 text-white sm:p-8 lg:p-10">
            <Plate tone="black">TS 08 W2 2026</Plate>
            <h4 className="mt-7 text-title font-extrabold">Company fleet</h4>
            <p className="mt-3 text-[15px] leading-[24px] text-ink-300">
              Black-plate cars that Way2Cars owns, leases or lawfully controls. They go out for self-drive only when their registration, permit, insurance, fitness and tax allow it.
            </p>
          </article>
          <article className="flex flex-col rounded-2xl border border-line bg-surface p-6 sm:p-8 lg:p-10">
            <Plate tone="white">TS 09 EK 4417</Plate>
            <h4 className="mt-7 text-title font-extrabold text-ink-950">Owner cars</h4>
            <p className="mt-3 text-[15px] leading-[24px] text-ink-600">
              White-plate cars from independent owners, listed under a Host Agreement. Each one is listed only after we verify that the arrangement is legally permitted and insured for that use.
            </p>
          </article>
        </div>
        <p className="mt-4 text-caption text-ink-500">Number plates shown are examples.</p>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 border-y border-line bg-brand-50">
      <div className={`${shell} ${sectionPad} grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-20`}>
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHead kicker="What you pay" title="Every charge has a name, and you see it first.">
            Prices vary by car, duration and package, so your exact total appears when you pick your dates. This is what can make up that total.
          </SectionHead>
          <p className="mt-6 max-w-xl border-l-2 border-brand-500 pl-4 text-bodySm leading-[22px] text-ink-700">
            Only pay through official Way2Cars channels. Nobody should ask you for a payment to a personal account, and owners can’t demand undisclosed charges.
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-raised sm:p-8">
          <div className="flex items-baseline justify-between gap-4 border-b-2 border-ink-950 pb-4">
            <p className="text-headline font-extrabold text-ink-950">Your booking summary</p>
            <p className="text-caption font-semibold text-ink-500">Before you pay</p>
          </div>
          <dl className="divide-y divide-line">
            {CHARGES.map(([name, when, detail]) => (
              <div key={name} className="grid gap-x-4 gap-y-0.5 py-4 sm:grid-cols-[1fr_auto]">
                <dt className="font-bold text-ink-950">{name}</dt>
                <dd className="text-caption font-semibold text-brand-600 sm:text-right">{when}</dd>
                <dd className="text-bodySm text-ink-500 sm:col-span-2">{detail}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 border-t-2 border-ink-950 pt-4 text-caption leading-[18px] text-ink-500">
            Your confirmation also names the car, registration number, approved drivers and permitted use. Any other booking-specific charge has to be clearly disclosed.
          </p>
        </div>
      </div>
    </section>
  );
}

function Requirements() {
  return (
    <section id="requirements" className="scroll-mt-20 bg-surface">
      <div className={`${shell} ${sectionPad} grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20`}>
        <SectionHead kicker="Before your first trip" title="What you’ll need to get verified." />
        <ul className="divide-y divide-line border-y border-line">
          {REQUIREMENTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4 py-5 sm:gap-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Icon size={20} aria-hidden /></span>
              <div>
                <h3 className="text-[16px] font-extrabold text-ink-950">{title}</h3>
                <p className="mt-1 text-bodySm leading-[22px] text-ink-600">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function OnTheRoad() {
  return (
    <section className="bg-ink-950 text-white">
      <div className={`${shell} ${sectionPad}`}>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <SectionHead light kicker="On the road" title="If something goes wrong, you know what to do." />
          <a href={TEL} className="inline-flex h-[52px] shrink-0 items-center justify-center gap-2.5 self-start rounded-md bg-white px-6 text-[15px] font-bold text-ink-950 transition-colors hover:bg-brand-50 lg:self-auto">
            <Phone size={17} aria-hidden /> {PHONE_DISPLAY}
          </a>
        </div>
        <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl bg-white/10 md:grid-cols-3 lg:mt-14">
          {ROADSIDE.map(({ icon: Icon, title, body }) => (
            <li key={title} className="bg-ink-950 p-6 sm:p-8">
              <Icon size={24} aria-hidden className="text-accent-300" />
              <h3 className="mt-5 text-[18px] font-extrabold">{title}</h3>
              <p className="mt-2 text-bodySm leading-[22px] text-ink-300">{body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 flex items-start gap-2.5 text-bodySm leading-[22px] text-ink-300">
          <MessageCircle size={17} aria-hidden className="mt-0.5 shrink-0 text-accent-300" />
          Trip and booking updates reach you on WhatsApp and in the app. You can turn WhatsApp updates off in the app’s notification settings.
        </p>
      </div>
    </section>
  );
}

function Owners() {
  return (
    <section id="owners" className="scroll-mt-20 bg-brand-900 text-white">
      <div className={`${shell} ${sectionPad} grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-20`}>
        <div>
          <SectionHead light kicker="For car owners" title="Your car sits idle most of the week. Let it earn.">
            List your car with Way2Cars and rent it to verified drivers. We handle listing, verification, booking, payments and documentation as agreed with you.
          </SectionHead>
          <p className="mt-6 text-bodySm leading-[22px] text-brand-200">
            Keep your RC, insurance, pollution certificate and photos ready. We check them before approving a listing, and your car’s proposed use has to be legally permitted.
          </p>
          <a href="/vendor" className="group mt-8 inline-flex h-[52px] items-center gap-2 rounded-md bg-white px-7 text-[15px] font-bold text-brand-900 transition-colors hover:bg-brand-50">
            Start hosting
            <ArrowRight size={18} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
        <ul className="grid gap-px overflow-hidden rounded-2xl bg-white/15 sm:grid-cols-2">
          {HOST_POINTS.map(([t, b]) => (
            <li key={t} className="bg-brand-900 p-6 lg:p-8">
              <p className="text-[17px] font-extrabold">{t}</p>
              <p className="mt-2 text-bodySm leading-[22px] text-brand-200">{b}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Policies() {
  return (
    <section id="policies" className="scroll-mt-20">
      <div className={`${shell} ${sectionPad}`}>
        <SectionHead kicker="Policies, in plain words" title="Know the rules before you book.">
          Here’s the short version. The full documents always apply, and each card links to the one it comes from.
        </SectionHead>
        <div className="mt-12 grid gap-5 md:grid-cols-3 lg:mt-14">
          {POLICIES.map((p) => (
            <a key={p.label} href={p.href} className="group flex flex-col rounded-2xl border border-line bg-surface p-6 transition hover:border-brand-300 hover:shadow-card lg:p-8">
              <p className="text-label font-bold text-ink-500">{p.label}</p>
              <p className="mt-4 text-[30px] font-extrabold tracking-tight text-ink-950 lg:text-[34px]">{p.value}</p>
              <p className="mt-3 flex-1 text-bodySm leading-[22px] text-ink-600">{p.note}</p>
              <span className="mt-6 inline-flex items-center gap-1 text-label font-bold text-brand-600">
                Read the policy <ArrowUpRight size={15} aria-hidden className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 border-t border-line bg-surface">
      <div className={`${shell} ${sectionPad} grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20`}>
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHead kicker="FAQ" title="Questions people ask before booking." />
          <p className="mt-5 text-[15px] leading-[24px] text-ink-600">
            Something else on your mind? Call <a href={TEL} className="link">{PHONE_DISPLAY}</a> or email <a href={`mailto:${EMAIL}`} className="link break-all">{EMAIL}</a>.
          </p>
        </div>
        <div className="divide-y divide-line border-y border-line">
          {FAQS.map(([q, a]) => (
            <details key={q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-5 py-5 text-[16px] font-bold text-ink-950 transition-colors hover:text-brand-600 [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown size={19} aria-hidden className="shrink-0 text-ink-400 transition-transform group-open:rotate-180" />
              </summary>
              <p className="max-w-2xl pb-6 pr-8 text-[15px] leading-[25px] text-ink-600">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function About() {
  return (
    <section className={`${shell} ${sectionPad}`}>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-end lg:gap-20">
        <div>
          <p className="text-label font-bold text-brand-600">About Way2Cars</p>
          <blockquote className="mt-4 text-[28px] font-extrabold leading-[1.2] tracking-[-0.02em] text-ink-950 sm:text-[38px]">
            “To make mobility simple, accessible and reliable for everyone.”
          </blockquote>
          <p className="mt-5 max-w-2xl text-[15px] leading-[25px] text-ink-600">
            {COMPANY} was founded by Kurella Ranjith Kumar, a Marketing Technology professional. We connect customers with vehicles from our company fleet and a network of independent owners. <a href="/about-us" className="link">More about us</a>
          </p>
        </div>
        <dl className="grid gap-6 border-t border-line pt-6 text-bodySm sm:grid-cols-2 lg:grid-cols-1">
          <div>
            <dt className="font-extrabold text-ink-950">Operations office</dt>
            <dd className="mt-1 leading-[22px] text-ink-600">{OFFICES.operational}</dd>
          </div>
          <div>
            <dt className="font-extrabold text-ink-950">Registered office</dt>
            <dd className="mt-1 leading-[22px] text-ink-600">{OFFICES.registered}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className={`${shell} pb-16 sm:pb-20 lg:pb-28`}>
      <div className="flex flex-col items-start justify-between gap-8 rounded-3xl bg-brand-500 p-7 text-white sm:p-12 lg:flex-row lg:items-center lg:p-16">
        <div>
          <h2 className="max-w-2xl text-[28px] font-extrabold leading-[1.15] tracking-[-0.02em] sm:text-[40px]">Planning a trip? See which cars are free for your dates.</h2>
          <p className="mt-3 text-[16px] text-brand-50">Signing in only takes your mobile number.</p>
        </div>
        <a href="/user" className="group inline-flex h-[52px] shrink-0 items-center gap-2 rounded-md bg-white px-7 text-[15px] font-bold text-brand-700 transition-colors hover:bg-brand-50">
          See available cars
          <ArrowRight size={18} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
        </a>
      </div>
    </section>
  );
}

/** Public landing page at "/". Links into the renter (/user) and host (/vendor) web apps. */
export default function Landing() {
  usePageMeta('Way2Cars | Self-drive car rental in Hyderabad', 'Book a verified self-drive car in Hyderabad by the hour or the day. See every charge before you pay, or list your own car with Way2Cars.');
  return (
    <div className="w2c-site min-h-[100dvh] bg-canvas font-sans text-ink-900 antialiased">
      <SiteHeader overHero />
      <main>
        <Hero />
        <HowItWorks />
        <Cars />
        <Pricing />
        <Requirements />
        <OnTheRoad />
        <Owners />
        <Policies />
        <Faq />
        <About />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  );
}
