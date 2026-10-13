/** Consistent success envelope: { success: true, data, meta? } */
export function ok(res, data, meta, status = 200) {
  const body = { success: true, data: data ?? null };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}
export const created = (res, data) => ok(res, data, undefined, 201);
export const noContent = (res) => res.status(204).end();
