/** An error whose message is safe to show the shopper. */
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Please sign in to continue.') =>
  new HttpError(401, 'UNAUTHORIZED', message);
export const notFound = (message = 'Not found.') => new HttpError(404, 'NOT_FOUND', message);
export const conflict = (code, message, details) => new HttpError(409, code, message, details);

/** Trims and length-caps a string field; throws a 400 naming the field if missing. */
export function requireString(body, field, { max = 200, optional = false } = {}) {
  const raw = body?.[field];
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) {
    if (optional) return null;
    throw badRequest(`${field} is required.`, { field });
  }
  if (value.length > max) throw badRequest(`${field} is too long.`, { field });
  return value;
}

export function requireInt(body, field, { min = 0, max = 1000 } = {}) {
  const value = Number(body?.[field]);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw badRequest(`${field} must be a whole number between ${min} and ${max}.`, { field });
  }
  return value;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function requireEmail(body, field = 'email') {
  const value = requireString(body, field, { max: 254 }).toLowerCase();
  if (!EMAIL.test(value)) throw badRequest('Enter a valid email address.', { field });
  return value;
}
