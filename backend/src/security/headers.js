/**
 * Browser-side half of the isolation boundary.
 *
 * The egress allowlist stops the SERVER from reaching SalesWolf; this stops the
 * PAGE from doing it. `connect-src 'self'` means injected or compromised
 * front-end code cannot fetch a SalesWolf host from the prospect's browser.
 *
 * `connect-src 'self'` stays correct as features land: the AI assistant calls
 * Anthropic server-side (the browser only ever talks to our own /api), and
 * same-origin WebSockets for the P3 chat match 'self' under CSP Level 3.
 */

const CSP = [
  "default-src 'self'",
  "connect-src 'self'",
  "script-src 'self'",
  // Vite injects styles inline; revisit if we move to extracted CSS.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  // A demo storefront has no business being indexed.
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
}

export { CSP };
