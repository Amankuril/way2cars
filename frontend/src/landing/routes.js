/**
 * Public document URLs. Kept free of React so src/main.jsx can import it without pulling in a page.
 * Canonical address is /<slug>. /user/pages/<slug> and /vendor/pages/<slug> also resolve here on a
 * full page load, because WhatsApp booking messages and older links point at them.
 */
const SLUGS = ['privacy-policy', 'terms-and-conditions', 'cancellation-policy', 'about-us', 'contact-us', 'rental-agreement', 'host-terms'];
const ALIASES = { privacy: 'privacy-policy', terms: 'terms-and-conditions', cancellation: 'cancellation-policy', about: 'about-us', contact: 'contact-us' };

export function legalSlugFromPath(pathname) {
  const m = pathname.match(/^\/(?:(?:user|vendor)\/pages\/)?([a-z-]+)\/?$/);
  if (!m) return null;
  const slug = ALIASES[m[1]] || m[1];
  return SLUGS.includes(slug) ? slug : null;
}
