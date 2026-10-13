import { z } from 'zod';

export const paginationQuery = {
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

/** Runs a paginated find + count in parallel. Returns { items, meta }. */
export async function paginate(model, filter, { page = 1, limit = 20, sort = { createdAt: -1 }, select, populate, lean = true } = {}) {
  let q = model.find(filter).sort(sort).skip((page - 1) * limit).limit(limit);
  if (select) q = q.select(select);
  if (populate) q = q.populate(populate);
  if (lean) q = q.lean();
  const [items, total] = await Promise.all([q, model.countDocuments(filter)]);
  return { items, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
