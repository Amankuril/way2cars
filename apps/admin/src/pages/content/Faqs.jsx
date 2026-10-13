import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HelpCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, ADMIN } from '@/lib/api.js';
import { AUDIENCE } from '@/lib/labels.js';
import { useAction } from '@/lib/hooks.js';
import { errorMessage, fieldErrorMap } from '@/lib/utils.js';
import { PageHeader } from '@/components/PageHeader.jsx';
import { Button, IconButton } from '@/components/Button.jsx';
import { ConfirmDialog, Modal } from '@/components/Modal.jsx';
import { Field, Input, Textarea, Select, Switch } from '@/components/Form.jsx';
import { FilterBar, FilterSelect, SearchInput } from '@/components/Filters.jsx';
import { StatusPill, Tag } from '@/components/StatusPill.jsx';
import { EmptyState, ErrorState } from '@/components/EmptyState.jsx';
import { SkeletonText } from '@/components/Skeleton.jsx';

function FaqForm({ faq, categories, onClose }) {
  const isNew = !faq._id;
  const [f, setF] = useState({
    audience: faq.audience || 'all', category: faq.category || 'General', question: faq.question || '', answer: faq.answer || '',
    sortOrder: String(faq.sortOrder ?? 0), isPublished: faq.isPublished !== false,
  });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = useAction((body) => (isNew ? api.post(`${ADMIN}/cms/faqs`, body) : api.patch(`${ADMIN}/cms/faqs/${faq._id}`, body)), {
    success: isNew ? 'FAQ added' : 'FAQ saved',
    invalidate: [['faqs']],
    toastError: false,
    onSuccess: onClose,
  });
  const submit = (e) => {
    e?.preventDefault();
    const next = {};
    if (f.question.trim().length < 5) next.question = 'Write a question of at least 5 characters.';
    if (f.answer.trim().length < 2) next.answer = 'Write the answer.';
    if (!/^\d+$/.test(f.sortOrder)) next.sortOrder = 'Whole number.';
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate(
      { audience: f.audience, category: f.category.trim() || 'General', question: f.question.trim(), answer: f.answer.trim(), sortOrder: Number(f.sortOrder), isPublished: f.isPublished },
      { onError: (err) => setErrors({ ...fieldErrorMap(err), form: err.status === 422 ? null : errorMessage(err) }) },
    );
  };
  return (
    <Modal
      open
      onClose={() => !save.isPending && onClose()}
      title={isNew ? 'New FAQ' : 'Edit FAQ'}
      size="lg"
      footer={
        <>
          <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={save.isPending}>{isNew ? 'Add FAQ' : 'Save FAQ'}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Shown to" htmlFor="faq-aud">
            <Select id="faq-aud" value={f.audience} onChange={set('audience')}>
              {Object.entries(AUDIENCE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Category" htmlFor="faq-cat" error={errors.category}>
            <Input id="faq-cat" value={f.category} onChange={set('category')} maxLength={60} list="faq-categories" />
            <datalist id="faq-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Order" htmlFor="faq-order" error={errors.sortOrder}>
            <Input id="faq-order" type="number" min={0} value={f.sortOrder} onChange={set('sortOrder')} className="num" />
          </Field>
        </div>
        <Field label="Question" htmlFor="faq-q" required error={errors.question}>
          <Input id="faq-q" value={f.question} onChange={set('question')} maxLength={300} invalid={Boolean(errors.question)} data-autofocus />
        </Field>
        <Field label="Answer" htmlFor="faq-a" required error={errors.answer} hint="Plain text. Line breaks are kept.">
          <Textarea id="faq-a" rows={6} value={f.answer} onChange={set('answer')} maxLength={3000} invalid={Boolean(errors.answer)} />
        </Field>
        <Switch label="Published" description="Unpublished FAQs are hidden from the apps." checked={f.isPublished} onChange={(v) => setF((x) => ({ ...x, isPublished: v }))} />
        {errors.form ? <p className="text-caption font-semibold text-danger-600" role="alert">{errors.form}</p> : null}
      </form>
    </Modal>
  );
}

export default function Faqs() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['faqs'], queryFn: () => api.get(`${ADMIN}/cms/faqs`) });
  const [audience, setAudience] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const remove = useAction((id) => api.del(`${ADMIN}/cms/faqs/${id}`), { success: 'FAQ deleted', invalidate: [['faqs']], toastError: false });

  const categories = useMemo(() => [...new Set((data || []).map((f) => f.category || 'General'))].sort(), [data]);
  const groups = useMemo(() => {
    const needle = q.toLowerCase();
    const list = (data || []).filter((f) => (!audience || f.audience === audience) && (!needle || `${f.question} ${f.answer}`.toLowerCase().includes(needle)));
    const map = new Map();
    for (const f of list) {
      const k = f.category || 'General';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(f);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data, audience, q]);

  return (
    <>
      <PageHeader title="FAQs" description="Help-centre questions for renters and hosts, grouped by category." actions={<Button variant="primary" icon={Plus} onClick={() => setEditing({})}>New FAQ</Button>} />
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Search questions and answers" label="Search FAQs" className="sm:w-72" delay={150} />
        <FilterSelect label="Shown to" value={audience} onChange={setAudience} options={AUDIENCE} allLabel="Any audience" />
      </FilterBar>
      {isLoading ? (
        <div className="panel p-5"><SkeletonText lines={6} /></div>
      ) : error ? (
        <div className="panel"><ErrorState error={error} onRetry={refetch} /></div>
      ) : !groups.length ? (
        <div className="panel"><EmptyState icon={HelpCircle} title={data.length ? 'No FAQs match' : 'No FAQs yet'} description={data.length ? 'Try another search or audience.' : 'Add the questions renters and hosts ask most often.'} /></div>
      ) : (
        <div className="space-y-5">
          {groups.map(([cat, list]) => (
            <section key={cat} className="panel overflow-hidden">
              <header className="flex items-center justify-between border-b border-line bg-ink-50 px-5 py-2.5">
                <h2 className="text-overline uppercase tracking-[0.08em] text-ink-600">{cat}</h2>
                <span className="text-caption text-ink-500">{list.length}</span>
              </header>
              <ul className="divide-y divide-line">
                {list.map((f) => (
                  <li key={f._id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-brand-50/30">
                    <div className="min-w-0 flex-1">
                      <p className="text-bodySm font-semibold text-ink-900">{f.question}</p>
                      <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-caption text-ink-600">{f.answer}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Tag tone={f.audience === 'vendor' ? 'info' : 'neutral'}>{AUDIENCE[f.audience]}</Tag>
                        {!f.isPublished ? <StatusPill tone="neutral" dot={false}>Unpublished</StatusPill> : null}
                        <span className="text-caption text-ink-400">Order {f.sortOrder}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <IconButton icon={Pencil} label="Edit FAQ" onClick={() => setEditing(f)} />
                      <IconButton icon={Trash2} label="Delete FAQ" onClick={() => setDeleting(f)} className="hover:text-danger-600" />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {editing ? <FaqForm faq={editing} categories={categories} onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete this FAQ?" description={deleting?.question} confirmLabel="Delete FAQ" tone="danger" onConfirm={() => remove.mutateAsync(deleting._id)} />
    </>
  );
}
