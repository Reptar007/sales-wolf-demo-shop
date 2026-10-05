/**
 * Boots the real app against the TEST database (TEST_DATABASE_URL), reset to
 * seed, on an ephemeral port. The egress allowlist is NOT installed here: these
 * tests dial 127.0.0.1, which the allowlist rightly refuses. egress.test.js
 * covers the allowlist on its own, in its own process.
 *
 * Suites that need a database call `requireTestDatabase(t)` and skip cleanly
 * when TEST_DATABASE_URL is unset, so `npm test` still runs the isolation guard
 * on a machine without Postgres. CI always sets it.
 */

import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (TEST_DATABASE_URL) {
  // Point every module at the test DB before any of them builds a client.
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.DEMO_JWT_SECRET ||= 'test-secret-not-for-production';
  process.env.DEMO_CONTROL_PASSPHRASE ||= 'test-passphrase';
}

export function hasTestDatabase() {
  return Boolean(TEST_DATABASE_URL);
}

/**
 * Starts the app on a random port with freshly seeded data.
 * Returns { baseUrl, server, prisma, reset, close }.
 */
export async function startTestServer() {
  const [{ createApp }, { getPrisma, disconnectPrisma }, { resetDemoData }, { invalidateFlags }] =
    await Promise.all([
      import('../../src/app.js'),
      import('../../src/db.js'),
      import('../../src/seed/reset.js'),
      import('../../src/chaos/flags.js'),
    ]);

  const prisma = getPrisma();
  const reset = async () => {
    await resetDemoData(prisma);
    invalidateFlags();
  };
  await reset();

  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    server,
    prisma,
    reset,
    async setFlag(key, enabled = true) {
      await prisma.chaosFlag.update({ where: { key }, data: { enabled } });
      invalidateFlags();
    },
    async close() {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
      await disconnectPrisma();
    },
  };
}

/**
 * A tiny browser stand-in: keeps cookies across requests, so each client is
 * one visitor. `client.json(path, { method, body })` returns { status, body }.
 */
export function createClient(baseUrl) {
  const jar = new Map();

  function remember(response) {
    for (const header of response.headers.getSetCookie()) {
      const [pair, ...attrs] = header.split(';');
      const [name, ...rest] = pair.split('=');
      const value = rest.join('=');
      const expired = attrs.some((a) => /max-age=0|expires=thu, 01 jan 1970/i.test(a.trim()));
      if (expired || value === '') jar.delete(name.trim());
      else jar.set(name.trim(), value);
    }
  }

  async function request(path, { method = 'GET', body, headers = {} } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    remember(response);
    return response;
  }

  return {
    jar,
    request,
    cookieHeader: () => [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
    async json(path, options) {
      const response = await request(path, options);
      const text = await response.text();
      return {
        status: response.status,
        body: text ? JSON.parse(text) : null,
        headers: response.headers,
      };
    },
  };
}
