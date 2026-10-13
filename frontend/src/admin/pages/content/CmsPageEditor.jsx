import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useBlocker } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Heading2, List, Pilcrow, Plus, Trash2, X } from 'lucide-react';
import { api, ADMIN } from '@/lib/api.js';
import { dateTime } from '@shared/lib/format.js';
import { useAction } from '@/lib/hooks.js';
import { cn, errorMessage } from '@/lib/utils.js';
import { PageHeader } from '@/components/PageHeader.jsx';
import { Panel } from '@/components/Panel.jsx';
import { Button, IconButton } from '@/components/Button.jsx';
import { Field, Input, Textarea, Switch, StickySaveBar } from '@/components/Form.jsx';
import { DetailSkeleton } from '@/components/Skeleton.jsx';
import { ErrorState, EmptyState } from '@/components/EmptyState.jsx';
import { StatusPill } from '@/components/StatusPill.jsx';
import { ConfirmDialog } from '@/components/Modal.jsx';
import { PAGE_NAMES } from './CmsPages.jsx';

const TYPES = {
  heading: { label: 'Heading', icon: Heading2 },
  paragraph: { label: 'Paragraph', icon: Pilcrow },
  list: { label: 'Bulleted list', icon: List },
};
let seq = 0;
const withKey = (b) => ({ ...b, _k: ++seq });
const newBlock = (type) => withKey(type === 'list' ? { type, items: [''] } : { type, text: '' });
const clean = (blocks) =>
  blocks
    .map((b) => (b.type === 'list' ? { type: 'list', items: (b.items || []).map((i) => i.trim()).filter(Boolean) } : { type: b.type, text: (b.text || '').trim() }))
    .filter((b) => (b.type === 'list' ? b.items.length : b.text));

function BlockEditor({ block, index, total, onChange, onMove, onRemove }) {
  const T = TYPES[block.type];
  const id = `blk-${block._k}`;
  return (
    <div className="group rounded-md border border-line bg-surface p-3 focus-within:border-brand-200">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-caption font-semibold text-ink-500">
          <T.icon className="h-3.5 w-3.5" aria-hidden="true" /> {T.label}
        </span>
        <div className="flex items-center gap-0.5">
          <IconButton size="sm" icon={ArrowUp} label="Move block up" disabled={index === 0} onClick={() => onMove(-1)} />
          <IconButton size="sm" icon={ArrowDown} label="Move block down" disabled={index === total - 1} onClick={() => onMove(1)} />
          <IconButton size="sm" icon={Trash2} label="Delete block" onClick={onRemove} className="hover:text-danger-600" />
        </div>
      </div>
      {block.type === 'heading' ? (
        <>
          <label htmlFor={id} className="sr-only">Heading text</label>
          <Input id={id} value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} className="font-bold" maxLength={5000} placeholder="Section heading" />
        </>
      ) : block.type === 'paragraph' ? (
        <>
          <label htmlFor={id} className="sr-only">Paragraph text</label>
          <Textarea id={id} rows={4} value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} maxLength={5000} placeholder="Paragraph text" />
        </>
      ) : (
        <ul className="space-y-1.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink-400" aria-hidden="true" />
              <label htmlFor={`${id}-${i}`} className="sr-only">List item {i + 1}</label>
              <Input
                id={`${id}-${i}`}
                value={item}
                maxLength={1000}
                placeholder="List item"
                onChange={(e) => onChange({ ...block, items: block.items.map((x, j) => (j === i ? e.target.value : x)) })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (block.items.length < 50) onChange({ ...block, items: [...block.items.slice(0, i + 1), '', ...block.items.slice(i + 1)] });
                  }
                }}
              />
              <IconButton size="sm" icon={X} label={`Remove item ${i + 1}`} disabled={block.items.length === 1} onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })} />
            </li>
          ))}
          <li>
            <Button size="xs" variant="ghost" icon={Plus} disabled={block.items.length >= 50} onClick={() => onChange({ ...block, items: [...block.items, ''] })}>Add item</Button>
          </li>
        </ul>
      )}
    </div>
  );
}

function Preview({ title, blocks }) {
  return (
    <article className="space-y-3 text-bodySm text-ink-800">
      <h2 className="text-headline text-ink-900">{title || 'Untitled page'}</h2>
      {blocks.map((b) =>
        b.type === 'heading' ? <h3 key={b._k} className="pt-2 text-bodySm font-bold text-ink-900">{b.text}</h3>
          : b.type === 'paragraph' ? <p key={b._k} className="whitespace-pre-line leading-relaxed">{b.text}</p>
            : <ul key={b._k} className="list-disc space-y-1 pl-5">{b.items.filter((i) => i.trim()).map((i, n) => <li key={n}>{i}</li>)}</ul>,
      )}
    </article>
  );
}

export default function CmsPageEditor() {
  const { slug } = useParams();
  const { data: pages, isLoading, error, refetch } = useQuery({ queryKey: ['cms-pages'], queryFn: () => api.get(`${ADMIN}/cms/pages`) });
  const page = useMemo(() => pages?.find((p) => p.slug === slug), [pages, slug]);
  const [title, setTitle] = useState('');
  const [blocks, setBlocks] = useState([]);
  const [published, setPublished] = useState(true);
  const [baseline, setBaseline] = useState(null);
  const [err, setErr] = useState(null);
  const loaded = useRef(null);

  const load = (p) => {
    setTitle(p.title || PAGE_NAMES[p.slug] || '');
    setBlocks((p.blocks || []).map(withKey));
    setPublished(p.version === 0 ? true : Boolean(p.isPublished));
    setBaseline(JSON.stringify({ t: p.title || PAGE_NAMES[p.slug] || '', b: clean(p.blocks || []), p: p.version === 0 ? true : Boolean(p.isPublished) }));
  };
  useEffect(() => {
    if (page && loaded.current !== `${page.slug}:${page.version}`) {
      loaded.current = `${page.slug}:${page.version}`;
      load(page);
    }
  }, [page]);

  const current = JSON.stringify({ t: title.trim(), b: clean(blocks), p: published });
  const dirty = baseline !== null && current !== baseline;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

  const save = useAction((body) => api.put(`${ADMIN}/cms/pages/${slug}`, body), {
    success: (p) => `Saved as version ${p.version}`,
    invalidate: [['cms-pages']],
    toastError: false,
  });

  if (isLoading) return <DetailSkeleton />;
  if (error) return <div className="panel"><ErrorState error={error} onRetry={refetch} /></div>;
  if (!page) return <div className="panel"><EmptyState title="Unknown page" description="This page is not one of the managed CMS pages." /></div>;

  const update = (i, b) => setBlocks((list) => list.map((x, j) => (j === i ? b : x)));
  const move = (i, d) => setBlocks((list) => {
    const next = [...list];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    return next;
  });
  const add = (type) => setBlocks((list) => [...list, newBlock(type)]);

  const submit = () => {
    setErr(null);
    const body = { title: title.trim(), blocks: clean(blocks), isPublished: published };
    if (body.title.length < 2) return setErr('Enter a page title.');
    if (!body.blocks.length) return setErr('Add at least one block with text.');
    save.mutate(body, { onError: (e) => setErr(errorMessage(e)) });
  };

  return (
    <>
      <PageHeader
        back={{ to: '/content/pages', label: 'Pages' }}
        title={PAGE_NAMES[slug] || slug}
        meta={page.version ? <><StatusPill tone={page.isPublished ? 'success' : 'neutral'}>{page.isPublished ? 'Published' : 'Draft'}</StatusPill><span className="text-caption text-ink-500">v{page.version}</span></> : <StatusPill tone="warning">Not created</StatusPill>}
        description={page.updatedAt ? `Last saved ${dateTime(page.updatedAt)} IST` : 'This page has not been written yet.'}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-4">
          <Panel>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="Page title" htmlFor="cms-title" required>
                <Input id="cms-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
              </Field>
              <Switch label="Published" description="Visible in the apps" checked={published} onChange={setPublished} className="sm:pb-1" />
            </div>
          </Panel>
          {blocks.length ? (
            <ol className="space-y-3">
              {blocks.map((b, i) => (
                <li key={b._k}>
                  <BlockEditor block={b} index={i} total={blocks.length} onChange={(nb) => update(i, nb)} onMove={(d) => move(i, d)} onRemove={() => setBlocks((l) => l.filter((_, j) => j !== i))} />
                </li>
              ))}
            </ol>
          ) : (
            <div className="rounded-md border border-dashed border-line p-8 text-center text-caption text-ink-500">No content yet — add a heading or paragraph below.</div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption font-semibold text-ink-500">Add block:</span>
            {Object.entries(TYPES).map(([type, t]) => (
              <Button key={type} size="sm" icon={t.icon} onClick={() => add(type)} disabled={blocks.length >= 200}>{t.label}</Button>
            ))}
          </div>
        </div>
        <Panel title="Preview" description="How the apps render this page" className={cn('xl:sticky xl:top-20 xl:self-start')} bodyClassName="scroll-thin max-h-[70vh] overflow-y-auto">
          <Preview title={title} blocks={blocks} />
        </Panel>
      </div>
      <StickySaveBar dirty={dirty} message={err ? <span className="font-semibold text-danger-600" role="alert">{err}</span> : undefined}>
        <Button onClick={() => load(page)} disabled={!dirty || save.isPending}>Discard changes</Button>
        <Button variant="primary" onClick={submit} loading={save.isPending} disabled={!dirty && page.version > 0}>
          {page.version ? 'Save new version' : 'Create page'}
        </Button>
      </StickySaveBar>
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onClose={() => blocker.state === 'blocked' && blocker.reset()}
        title="Leave without saving?"
        description="Your changes to this page will be lost."
        confirmLabel="Discard and leave"
        tone="danger"
        onConfirm={() => blocker.proceed?.()}
      />
    </>
  );
}
