import { useEffect, useState } from 'react';
import { Mail, MapPin, Menu, Phone, X } from 'lucide-react';
import MARK from '@shared/assets/mark.png';

export const PHONE = '8105997555';
export const PHONE_DISPLAY = '81059 97555';
export const TEL = `tel:+91${PHONE}`;
export const EMAIL = 'way2carstechnology@gmail.com';
export const COMPANY = 'Way2Cars Technology Private Limited';
export const OFFICES = {
  operational: 'Miyapur Main Road, behind Hamara Family Restaurant, Bachupally, Hyderabad 500043',
  registered: '14-38, Adharsha Nagar, Bachannapet, Jangaon, Telangana 506221',
};
export const DOCS = [
  { slug: 'terms-and-conditions', label: 'Terms & conditions' },
  { slug: 'privacy-policy', label: 'Privacy policy' },
  { slug: 'cancellation-policy', label: 'Cancellation & refunds' },
  { slug: 'about-us', label: 'About us' },
  { slug: 'contact-us', label: 'Contact' },
];

const NAV = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#cars', label: 'Cars' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#owners', label: 'For owners' },
  { href: '/#faq', label: 'FAQ' },
];

/** Sets the tab title and meta description for a public page. */
export function usePageMeta(title, description) {
  useEffect(() => {
    document.title = title;
    if (description) document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  }, [title, description]);
}

export function Logo({ dark }) {
  return (
    <a href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Way2Cars home">
      <img src={MARK} alt="" width="58" height="24" className={`h-6 w-auto ${dark ? 'brightness-0 invert' : ''}`} />
      <span className={`text-[16px] font-extrabold tracking-[0.06em] ${dark ? 'text-white' : 'text-ink-950'}`}>WAY2CARS</span>
    </a>
  );
}

/**
 * Site header. With `overHero` it sits transparent on the dark hero and turns solid once the page scrolls.
 */
export function SiteHeader({ overHero = false }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!overHero) return undefined;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [overHero]);

  const dark = overHero && !scrolled && !open;
  return (
    <header className={`sticky top-0 z-40 transition-colors duration-200 print:hidden ${dark ? 'border-b border-white/10 bg-brand-900' : 'border-b border-line bg-surface/95 backdrop-blur'}`}>
      <div className="mx-auto flex h-[68px] max-w-7xl items-center gap-8 px-4 sm:px-6 lg:px-8">
        <Logo dark={dark} />
        <nav className="hidden items-center gap-7 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className={`text-bodySm font-semibold transition-colors ${dark ? 'text-brand-100 hover:text-white' : 'text-ink-600 hover:text-ink-950'}`}>{n.label}</a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:gap-4">
          <a href={TEL} className={`hidden items-center gap-2 text-bodySm font-semibold transition-colors md:inline-flex ${dark ? 'text-white hover:text-accent-200' : 'text-ink-800 hover:text-brand-600'}`}>
            <Phone size={15} aria-hidden /> {PHONE_DISPLAY}
          </a>
          <a href="/user" data-testid="entry-user-header" className={`hidden h-10 items-center rounded-md px-4 text-label font-bold transition-colors sm:inline-flex ${dark ? 'bg-white text-brand-900 hover:bg-brand-50' : 'bg-brand-500 text-white hover:bg-brand-600'}`}>
            Book a car
          </a>
          <button type="button" onClick={() => setOpen((v) => !v)} className={`inline-flex h-10 w-10 items-center justify-center rounded-md lg:hidden ${dark ? 'text-white' : 'text-ink-800'}`} aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-line bg-surface px-4 pb-4 sm:px-6 lg:hidden" aria-label="Mobile">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="block border-b border-line py-3 text-body font-semibold text-ink-800">{n.label}</a>
          ))}
          <a href={TEL} className="mt-2 flex items-center gap-2 py-2.5 text-body font-semibold text-ink-800"><Phone size={16} aria-hidden /> {PHONE_DISPLAY}</a>
          <a href="/user" className="mt-1 flex h-11 items-center justify-center rounded-md bg-brand-500 text-label font-bold text-white">Book a car</a>
        </nav>
      )}
    </header>
  );
}

function FooterHeading({ children }) {
  return <p className="text-caption font-bold uppercase tracking-[0.12em] text-ink-400">{children}</p>;
}

export function SiteFooter() {
  const link = 'text-ink-300 transition-colors hover:text-white';
  return (
    <footer className="bg-ink-950 text-bodySm print:hidden">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.5fr_0.8fr_1fr_1.3fr] lg:gap-12 lg:px-8 lg:py-16">
        <div>
          <Logo dark />
          <p className="mt-4 max-w-xs leading-[22px] text-ink-400">Self-drive car rental in Hyderabad, from our own fleet and verified independent owners.</p>
          <p className="mt-4 font-semibold text-white">Your journey, your way.</p>
        </div>
        <div>
          <FooterHeading>Get started</FooterHeading>
          <ul className="mt-4 space-y-3">
            <li><a href="/user" className={link}>Book a car</a></li>
            <li><a href="/vendor" className={link}>List your car</a></li>
            <li><a href="/#how-it-works" className={link}>How it works</a></li>
            <li><a href="/#faq" className={link}>FAQ</a></li>
          </ul>
        </div>
        <div>
          <FooterHeading>Company</FooterHeading>
          <ul className="mt-4 space-y-3">
            {DOCS.map((d) => <li key={d.slug}><a href={`/${d.slug}`} className={link}>{d.label}</a></li>)}
          </ul>
        </div>
        <div>
          <FooterHeading>Reach us</FooterHeading>
          <ul className="mt-4 space-y-3 text-ink-300">
            <li><a href={TEL} className={`inline-flex items-center gap-2.5 ${link}`}><Phone size={15} aria-hidden className="shrink-0 text-ink-500" /> {PHONE_DISPLAY}</a></li>
            <li><a href={`mailto:${EMAIL}`} className={`inline-flex items-center gap-2.5 break-all ${link}`}><Mail size={15} aria-hidden className="shrink-0 text-ink-500" /> {EMAIL}</a></li>
            <li className="flex gap-2.5 leading-[21px]"><MapPin size={15} aria-hidden className="mt-[3px] shrink-0 text-ink-500" /> <address className="not-italic">{OFFICES.operational}</address></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-caption leading-[18px] text-ink-400 sm:px-6 lg:flex-row lg:justify-between lg:gap-8 lg:px-8">
          <span>© {new Date().getFullYear()} {COMPANY}. Registered office: {OFFICES.registered}.</span>
          <span className="shrink-0">Grievance Officer: Kurella Venkatesh</span>
        </div>
      </div>
    </footer>
  );
}
