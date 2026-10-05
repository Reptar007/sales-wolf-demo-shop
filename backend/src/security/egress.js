/**
 * Outbound network allowlist.
 *
 * WolfMart is a PUBLIC, unauthenticated site. Its most exposed surface is the AI
 * assistant, which accepts arbitrary prospect input and is therefore the most
 * likely source of an SSRF or prompt-injection-driven fetch. This module is the
 * control that makes such a bug inert: the server can open exactly one class of
 * outbound connection (the Anthropic API) and nothing else.
 *
 * This is the teeth behind the project's hard requirement — the public URL must
 * never be able to reach SalesWolf. Deploy isolation (separate app, separate DB,
 * separate config vars) means there is nothing to reach; this means a bug cannot
 * go looking anyway.
 *
 * Two layers, because Node has two independent HTTP stacks:
 *   1. undici's global dispatcher — covers global `fetch`, which is what the
 *      Anthropic SDK uses.
 *   2. http.request / https.request — covers every other client (axios,
 *      node-fetch v2, anything a future dependency drags in).
 *
 * Default is DENY. Adding a host means editing ALLOWED_HOSTS here, in a diff a
 * reviewer will see.
 */

import http from 'node:http';
import https from 'node:https';
import { Agent, buildConnector, setGlobalDispatcher } from 'undici';

/** The only hosts this server may talk to. Default-deny; everything else fails. */
export const ALLOWED_HOSTS = Object.freeze(['api.anthropic.com']);

/**
 * Not load-bearing — ALLOWED_HOSTS already denies these. Listed so that a block
 * against SalesWolf logs as a deliberate policy hit rather than an anonymous
 * default-deny, which is the difference between noticing an incident and not.
 *
 * `sales-wolf.com` (hyphenated) is the internal toolkit's public domain and
 * `saleswolf.com` its name; both match subdomains too. Neither pattern matches
 * this app's own hosts (`www.wolfmartdemo.com`, `sales-wolf-demo-shop-*.herokuapp.com`).
 */
export const NEVER_ALLOWED = Object.freeze([
  'saleswolf.com',
  'sales-wolf.com',
  'qa-sales-engineering.herokuapp.com',
]);

export class EgressBlockedError extends Error {
  constructor(hostname) {
    super(
      `Egress blocked: ${hostname} is not on the WolfMart allowlist ` +
        `(allowed: ${ALLOWED_HOSTS.join(', ') || 'none'}). ` +
        `See backend/src/security/egress.js.`,
    );
    this.name = 'EgressBlockedError';
    this.hostname = hostname;
    this.code = 'EGRESS_BLOCKED';
  }
}

const normalize = (hostname) =>
  String(hostname || '')
    .toLowerCase()
    .replace(/\.$/, '');

/** Exact host, or a subdomain of an allowed host. */
function matches(hostname, pattern) {
  return hostname === pattern || hostname.endsWith(`.${pattern}`);
}

export function isAllowedHost(hostname) {
  const host = normalize(hostname);
  if (!host) return false;
  // Explicit denials win, so a future allowlist edit can't accidentally
  // re-open a path to SalesWolf.
  if (NEVER_ALLOWED.some((p) => matches(host, p))) return false;
  return ALLOWED_HOSTS.some((p) => matches(host, p));
}

/** Records every blocked attempt so an SSRF probe shows up in the logs. */
export function reportBlocked(hostname) {
  const host = normalize(hostname);
  const internal = NEVER_ALLOWED.some((p) => matches(host, p));
  console.error(
    internal
      ? `[egress] BLOCKED outbound connection to ${hostname} (internal toolkit host: policy violation)`
      : `[egress] BLOCKED outbound connection to ${hostname}`,
  );
}

/** Layer 1: undici, which backs global fetch. */
function installFetchAllowlist() {
  const connect = buildConnector({});
  setGlobalDispatcher(
    new Agent({
      connect(options, callback) {
        const host = normalize(options.hostname);
        if (!isAllowedHost(host)) {
          reportBlocked(host);
          return callback(new EgressBlockedError(host), null);
        }
        return connect(options, callback);
      },
    }),
  );
}

/**
 * Layer 2: the classic http/https stacks.
 *
 * Wraps `request` rather than the underlying socket so the rejection is a normal
 * client error every HTTP library already knows how to surface, instead of an
 * unhandled socket failure.
 */
function installLegacyHttpAllowlist() {
  for (const mod of [http, https]) {
    const original = mod.request.bind(mod);
    mod.request = function guardedRequest(...args) {
      const host = normalize(resolveHost(args));
      if (!isAllowedHost(host)) {
        reportBlocked(host);
        throw new EgressBlockedError(host);
      }
      return original(...args);
    };
    // http.get delegates to the module's own request, so it inherits the guard
    // only if we rebind it too.
    mod.get = function guardedGet(...args) {
      const req = mod.request(...args);
      req.end();
      return req;
    };
  }
}

/** http.request accepts (url), (options), or (url, options) — cover all three. */
function resolveHost(args) {
  for (const arg of args) {
    if (typeof arg === 'string') return safeUrlHost(arg);
    if (arg instanceof URL) return arg.hostname;
    if (arg && typeof arg === 'object') {
      if (arg.hostname || arg.host) return String(arg.hostname || arg.host).split(':')[0];
    }
  }
  return '';
}

function safeUrlHost(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}

let installed = false;

/**
 * Must run before the server accepts traffic. `assertEgressAllowlistInstalled`
 * enforces that ordering at boot, and a test asserts it in CI.
 */
export function installEgressAllowlist() {
  if (installed) return;
  installFetchAllowlist();
  installLegacyHttpAllowlist();
  installed = true;
  console.log(`[egress] allowlist active — permitted hosts: ${ALLOWED_HOSTS.join(', ')}`);
}

export function isEgressAllowlistInstalled() {
  return installed;
}

export function assertEgressAllowlistInstalled() {
  if (!installed) {
    throw new Error(
      'Refusing to start: the egress allowlist is not installed. ' +
        'installEgressAllowlist() must run before the server listens.',
    );
  }
}
