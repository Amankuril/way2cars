import { useEffect } from 'react';
import { ArrowRight, CarFront, KeyRound, ShieldCheck, BadgeIndianRupee, Headset } from 'lucide-react';
import MARK from '@shared/assets/mark.png';

const ENTRIES = [
  {
    href: '/user',
    icon: CarFront,
    eyebrow: 'For renters',
    title: 'Rent a car',
    body: 'Self-drive cars by the hour or day. Transparent prices, verified cars.',
    cta: 'Find a car',
    testId: 'entry-user',
  },
  {
    href: '/vendor',
    icon: KeyRound,
    eyebrow: 'For car owners',
    title: 'Become a host',
    body: 'Earn from your car on your schedule. You approve every booking.',
    cta: 'Start hosting',
    testId: 'entry-vendor',
  },
];

const POINTS = [
  { icon: ShieldCheck, text: 'Every car’s RC, insurance and PUC checked' },
  { icon: BadgeIndianRupee, text: 'Taxes, deposit and free km shown upfront' },
  { icon: Headset, text: '24×7 roadside help on every trip' },
];

/** Public landing at "/": two clear entry points into the renter and host web apps. */
export default function Landing() {
  useEffect(() => {
    document.title = 'WAY2CARS — Self-drive car rentals';
  }, []);
  return (
    <div className="min-h-[100dvh] bg-canvas font-sans text-ink-900 antialiased">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col px-5 pb-8 pt-[max(24px,env(safe-area-inset-top))] sm:px-8">
        <header className="flex items-center gap-2.5">
          <img src={MARK} alt="" width="56" height="24" className="h-6 w-auto" />
          <span className="text-headline font-extrabold tracking-wide">WAY2CARS</span>
        </header>

        <main className="flex flex-1 flex-col justify-center py-10 sm:py-14">
          <div className="max-w-2xl">
            <img src={MARK} alt="WAY2CARS" width="468" height="193" className="h-auto w-36 sm:w-44" />
            <h1 className="mt-6 text-[32px] font-extrabold leading-[38px] tracking-tight sm:text-[44px] sm:leading-[52px]">
              Self-drive cars,
              <br />
              <span className="bg-gradient-to-r from-brand-500 to-accent-500 bg-clip-text text-transparent">ready when you are.</span>
            </h1>
            <p className="mt-3 max-w-xl text-body text-ink-600">Rent a verified car near you, or list yours and earn — all with your mobile number.</p>
          </div>

          <div className="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-2">
            {ENTRIES.map(({ href, icon: Icon, eyebrow, title, body, cta, testId }) => (
              <a
                key={href}
                href={href}
                data-testid={testId}
                className="group flex flex-col rounded-xl border border-line bg-surface p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-pop focus-visible:outline-offset-4 active:translate-y-0 sm:p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-500 group-hover:text-white">
                    <Icon size={24} strokeWidth={2} aria-hidden />
                  </div>
                  <span className="rounded-full bg-ink-100 px-2.5 py-1 text-overline uppercase tracking-wider text-ink-600">{eyebrow}</span>
                </div>
                <h2 className="mt-5 text-title font-bold">{title}</h2>
                <p className="mt-1.5 text-bodySm text-ink-600">{body}</p>
                <span className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-md bg-brand-500 px-5 text-label font-semibold text-white transition-colors group-hover:bg-brand-600 sm:self-start">
                  {cta}
                  <ArrowRight size={18} strokeWidth={2.2} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </a>
            ))}
          </div>

          <ul className="mt-8 grid gap-3 sm:grid-cols-3">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-bodySm text-ink-700">
                <Icon size={18} className="shrink-0 text-brand-600" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-5 text-caption text-ink-500">
          <span>© {new Date().getFullYear()} WAY2CARS Technology Pvt Ltd</span>
          <span className="flex gap-4">
            <a className="hover:text-ink-800" href="/user/pages/terms-and-conditions">Terms</a>
            <a className="hover:text-ink-800" href="/user/pages/privacy-policy">Privacy</a>
          </span>
        </footer>
      </div>
    </div>
  );
}
