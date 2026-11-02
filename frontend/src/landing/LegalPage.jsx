import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Mail, Phone, Printer, RefreshCw } from 'lucide-react';
import { legalSlugFromPath } from './routes';
import { DOCS, EMAIL, PHONE, PHONE_DISPLAY, SiteFooter, SiteHeader, TEL, usePageMeta } from './site';

const LEADS = {
  'terms-and-conditions': 'The agreement between you and Way2Cars when you book a car, list a car or use our platform.',
  'privacy-policy': 'What personal information we collect, why we collect it, who it is shared with and the choices you have.',
  'cancellation-policy': 'What happens to your money when a booking is cancelled, by you or by us.',
  'about-us': 'Who we are and what we are building.',
  'contact-us': 'How to reach our support team and offices.',
};

const anchor = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Splits CMS blocks into a preamble and titled sections, and pulls the numbering out of plain-text
 * paragraphs ("12.3. …", "3.1.1. …", "A. …") so it can be typeset. The text itself is never changed.
 */
function parseDocument(blocks) {
  const preamble = [];
  const sections = [];
  let effective = null;
  blocks.forEach((b) => {
    if (b.type === 'heading') {
      sections.push({ id: anchor(b.text), title: b.text, blocks: [] });
      return;
    }
    if (!sections.length && b.type === 'paragraph' && /^effective date/i.test(b.text)) {
      effective = b.text;
      return;
    }
    (sections.length ? sections[sections.length - 1].blocks : preamble).push(b);
  });
  return { preamble, sections, effective };
}

function classify(text) {
  const clause = text.match(/^(\d+\.\d+(?:\.\d+)?)\.\s+(.*)$/s);
  if (clause) {
    const [, number, body] = clause;
    const depth = number.split('.').length;
    if (body.length < 110 && !/[.:;]$/.test(body)) return { kind: 'subhead', number, body };
    return { kind: 'clause', number, body, depth };
  }
  if (/^[A-Z]\.\s/.test(text) && text.length < 90) return { kind: 'subhead', body: text };
  return { kind: 'text', body: text };
}

/** Plain text with emails and the support number turned into links. No HTML is ever injected. */
function Rich({ text }) {
  const parts = text.split(new RegExp(`(${EMAIL.replace(/\./g, '\\.')}|${PHONE})`));
  return parts.map((part, i) => {
    if (part === EMAIL) return <a key={i} href={`mailto:${EMAIL}`} className="link [overflow-wrap:anywhere]">{part}</a>;
    if (part === PHONE) return <a key={i} href={TEL} className="link whitespace-nowrap">{PHONE_DISPLAY}</a>;
    return part;
  });
}

function ListItem({ text }) {
  const kv = text.match(/^([A-Z][A-Za-z/&' -]{2,34}):\s+(.+)$/);
  return (
    <li className="relative pl-5 before:absolute before:left-0 before:top-[11px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-brand-400">
      {kv ? <><span className="font-bold text-ink-900">{kv[1]}:</span> <Rich text={kv[2]} /></> : <Rich text={text} />}
    </li>
  );
}

function Block({ b }) {
  if (b.type === 'list') {
    return <ul className="my-4 space-y-2.5">{(b.items || []).map((it, i) => <ListItem key={i} text={it} />)}</ul>;
  }
  const c = classify(b.text || '');
  if (c.kind === 'subhead') {
    return (
      <h3 className="mb-3 mt-8 text-[17px] font-extrabold leading-[25px] text-ink-950">
        {c.number && <span className="mr-2 text-brand-600">{c.number}</span>}{c.body}
      </h3>
    );
  }
  if (c.kind === 'clause') {
    return (
      <p className={`my-3.5 grid gap-x-3 sm:grid-cols-[3.25rem_minmax(0,1fr)] ${c.depth === 3 ? 'sm:ml-4' : ''}`}>
        <span className="font-mono text-caption font-bold leading-[27px] text-ink-400">{c.number}</span>
        <span><Rich text={c.body} /></span>
      </p>
    );
  }
  return <p className="my-4"><Rich text={c.body} /></p>;
}

/** Tracks which section heading is currently being read. */
function useActiveSection(ids) {
  const [active, setActive] = useState(null);
  useEffect(() => {
    if (!ids.length) return undefined;
    const update = () => {
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 120) current = id;
      }
      setActive(current);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [ids]);
  return active;
}

function Toc({ sections, active }) {
  const nav = useRef(null);
  useEffect(() => {
    const box = nav.current;
    const item = box?.querySelector(`[data-toc="${active}"]`);
    if (!item) return;
    // Scrolls only the list, never the page.
    if (item.offsetTop < box.scrollTop + 40 || item.offsetTop > box.scrollTop + box.clientHeight - 60) box.scrollTop = item.offsetTop - box.clientHeight / 2;
  }, [active]);
  return (
    <nav ref={nav} aria-label="On this page" className="scroll-thin relative max-h-[calc(100dvh-8.5rem)] overflow-y-auto pr-2">
      <p className="mb-3 text-caption font-bold uppercase tracking-[0.12em] text-ink-400">On this page</p>
      <ul className="border-l border-line">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              data-toc={s.id}
              aria-current={active === s.id ? 'location' : undefined}
              className={`-ml-px block border-l-2 py-1.5 pl-3.5 text-[13px] font-semibold leading-[18px] transition-colors ${active === s.id ? 'border-brand-500 text-brand-600' : 'border-transparent text-ink-500 hover:text-ink-900'}`}
            >
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function MobileToc({ sections }) {
  const ref = useRef(null);
  return (
    <details ref={ref} className="group mb-8 rounded-lg border border-line bg-surface lg:hidden print:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 text-bodySm font-bold text-ink-900 [&::-webkit-details-marker]:hidden">
        On this page ({sections.length})
        <ChevronDown size={18} aria-hidden className="text-ink-400 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="max-h-[50dvh] overflow-y-auto border-t border-line py-2">
        {sections.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} onClick={() => { ref.current.open = false; }} className="block px-4 py-2 text-bodySm text-ink-600">{s.title}</a>
          </li>
        ))}
      </ul>
    </details>
  );
}

function HelpCard() {
  return (
    <aside className="rounded-xl border border-line bg-surface p-5 print:hidden">
      <p className="text-bodySm font-extrabold text-ink-950">Have a question about this?</p>
      <p className="mt-1.5 text-caption leading-[18px] text-ink-500">Our team can explain anything on this page.</p>
      <a href={TEL} className="mt-4 flex items-center gap-2 text-bodySm font-bold text-brand-600 hover:text-brand-700"><Phone size={15} aria-hidden /> {PHONE_DISPLAY}</a>
      <a href={`mailto:${EMAIL}`} className="mt-2.5 flex items-center gap-2 text-bodySm font-bold text-brand-600 hover:text-brand-700"><Mail size={15} aria-hidden /> Email us</a>
    </aside>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4" role="progressbar" aria-label="Loading">
      <div className="h-7 w-1/2 rounded bg-ink-100" />
      {[100, 96, 88, 60].map((w) => <div key={w} className="h-4 rounded bg-ink-100" style={{ width: `${w}%` }} />)}
      <div className="!mt-10 h-7 w-2/5 rounded bg-ink-100" />
      {[100, 92, 70].map((w) => <div key={w} className="h-4 rounded bg-ink-100" style={{ width: `${w}%` }} />)}
    </div>
  );
}

function ErrorPanel({ notFound, onRetry }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-6 sm:p-8">
      <h2 className="text-headline font-extrabold text-ink-950">{notFound ? 'This page isn’t published yet' : 'We couldn’t load this page'}</h2>
      <p className="mt-2 text-[15px] leading-[24px] text-ink-600">
        {notFound ? 'Please check back soon, or contact us and we’ll send you the details.' : 'Check your connection and try again.'} You can also call <a href={TEL} className="link">{PHONE_DISPLAY}</a>.
      </p>
      {!notFound && (
        <button type="button" onClick={onRetry} className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-brand-500 px-4 text-label font-bold text-white hover:bg-brand-600">
          <RefreshCw size={15} aria-hidden /> Try again
        </button>
      )}
    </div>
  );
}

function useCmsPage(slug) {
  const [state, setState] = useState({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    setState({ status: 'loading' });
    fetch(`/api/v1/public/pages/${slug}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
      .then(async (res) => {
        if (res.status === 404) return setState({ status: 'notFound' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return setState({ status: 'ready', page: (await res.json()).data });
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setState({ status: 'error' });
      });
    return () => ctrl.abort();
  }, [slug, attempt]);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { ...state, retry };
}

/** Full-width public layout for CMS legal and company pages, at every screen size. */
export default function LegalPage() {
  const slug = legalSlugFromPath(window.location.pathname);
  const { status, page, retry } = useCmsPage(slug);
  const doc = useMemo(() => (page ? parseDocument(page.blocks || []) : null), [page]);
  const sections = doc?.sections || [];
  const ids = useMemo(() => sections.map((s) => s.id), [sections]);
  const active = useActiveSection(ids);
  const docLabel = DOCS.find((d) => d.slug === slug)?.label;
  const title = page?.title || docLabel || 'Way2Cars';
  usePageMeta(`${title} | Way2Cars`, LEADS[slug]);

  // The sections arrive after load, so the browser can't jump to a #hash on its own.
  useEffect(() => {
    if (status === 'ready' && window.location.hash) {
      document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView();
    }
  }, [status]);

  // On phones the tab row scrolls sideways, so bring the current document's tab into view.
  const tabs = useRef(null);
  useEffect(() => {
    const box = tabs.current;
    const tab = box?.querySelector('[aria-current="page"]');
    if (tab && box.scrollWidth > box.clientWidth) box.scrollLeft = tab.offsetLeft - box.offsetLeft - 16;
  }, []);

  const hasToc = sections.length >= 3;
  const updated = page?.updatedAt ? new Date(page.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  return (
    <div className="w2c-site flex min-h-[100dvh] flex-col bg-canvas font-sans text-ink-900 antialiased print:bg-white">
      <SiteHeader />

      <div className="border-b border-line bg-surface">
        <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8 lg:pt-14 print:pt-0">
          <h1 className="text-[34px] font-extrabold leading-[1.12] tracking-[-0.025em] text-ink-950 sm:text-[44px] lg:text-[52px]">{title}</h1>
          {LEADS[slug] && <p className="mt-4 max-w-2xl text-[16px] leading-[26px] text-ink-600 lg:text-[18px] lg:leading-[29px]">{LEADS[slug]}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-label text-ink-500">
            {doc?.effective ? <span>{doc.effective}</span> : updated && <span>Last updated {updated}</span>}
            {status === 'ready' && hasToc && (
              <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 font-bold text-brand-600 hover:text-brand-700 print:hidden">
                <Printer size={15} aria-hidden /> Print or save as PDF
              </button>
            )}
          </div>
          <nav ref={tabs} aria-label="Documents" className="scroll-thin -mx-4 mt-8 flex gap-6 overflow-x-auto px-4 sm:mx-0 sm:px-0 lg:gap-8 print:hidden">
            {DOCS.map((d) => (
              <a key={d.slug} href={`/${d.slug}`} aria-current={d.slug === slug ? 'page' : undefined} className={`shrink-0 whitespace-nowrap border-b-2 pb-3 text-bodySm font-bold transition-colors ${d.slug === slug ? 'border-brand-500 text-ink-950' : 'border-transparent text-ink-500 hover:text-ink-900'}`}>
                {d.label}
              </a>
            ))}
          </nav>
        </div>
      </div>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6 lg:px-8 lg:py-14 print:py-4">
        <div className={`grid gap-10 ${hasToc ? 'lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-14 xl:grid-cols-[280px_minmax(0,1fr)_240px] xl:gap-16' : 'lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-16'}`}>
          {hasToc && (
            <div className="hidden lg:block print:hidden">
              <div className="sticky top-[100px]"><Toc sections={sections} active={active} /></div>
            </div>
          )}

          <div className="min-w-0 max-w-[760px]">
            {status === 'loading' && <Skeleton />}
            {(status === 'error' || status === 'notFound') && <ErrorPanel notFound={status === 'notFound'} onRetry={retry} />}
            {status === 'ready' && (
              <article className="text-[16px] font-medium leading-[27px] text-ink-700">
                {hasToc && <MobileToc sections={sections} />}
                {doc.preamble.length > 0 && (
                  <div className={hasToc ? 'mb-10 rounded-xl border border-line bg-surface px-5 py-1 text-[15px] leading-[25px] sm:px-6' : ''}>
                    {doc.preamble.map((b, i) => <Block key={i} b={b} />)}
                  </div>
                )}
                {sections.map((s) => (
                  <section key={s.id} className="mt-12 first-of-type:mt-0">
                    <h2 id={s.id} className="group scroll-mt-24 text-[23px] font-extrabold leading-[31px] tracking-[-0.01em] text-ink-950 lg:text-[26px] lg:leading-[34px]">
                      <a href={`#${s.id}`} className="hover:text-brand-600">{s.title}</a>
                    </h2>
                    <div className="mt-4">{s.blocks.map((b, i) => <Block key={i} b={b} />)}</div>
                  </section>
                ))}
              </article>
            )}
          </div>

          <div className={hasToc ? 'lg:col-start-2 xl:col-start-3 xl:row-start-1' : ''}>
            <div className="xl:sticky xl:top-[100px]"><HelpCard /></div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
