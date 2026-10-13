import { validationError } from '../core/errors.js';

const format = (error) =>
  error.issues.map((i) => ({ field: i.path.join('.') || undefined, message: i.message, code: i.code }));

/**
 * Validates and coerces request parts with zod. Parsed values land in req.valid.{body,query,params};
 * handlers must read from req.valid only, never from raw req.body/req.query.
 */
export const validate = (schemas) => (req, _res, next) => {
  req.valid = req.valid || {};
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part] ?? {});
    if (!result.success) return next(validationError(format(result.error)));
    req.valid[part] = result.data;
  }
  next();
};
