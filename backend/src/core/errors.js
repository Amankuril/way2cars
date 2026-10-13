/** Operational error with a stable machine-readable code and an HTTP status. */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = true;
  }
}

export const badRequest = (message, details, code = 'BAD_REQUEST') => new AppError(400, code, message, details);
export const validationError = (details) => new AppError(422, 'VALIDATION_FAILED', 'Some fields are invalid.', details);
export const unauthorized = (message = 'Please sign in to continue.', code = 'UNAUTHENTICATED') =>
  new AppError(401, code, message);
export const forbidden = (message = 'You do not have permission to do this.', code = 'FORBIDDEN') =>
  new AppError(403, code, message);
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found.`);
export const conflict = (message, code = 'CONFLICT', details) => new AppError(409, code, message, details);
export const tooMany = (message, retryAfterSeconds) =>
  new AppError(429, 'RATE_LIMITED', message, retryAfterSeconds ? { retryAfterSeconds } : undefined);
export const unavailable = (message, code = 'SERVICE_UNAVAILABLE') => new AppError(503, code, message);
export const providerError = (message, code = 'PROVIDER_ERROR') => new AppError(502, code, message);
