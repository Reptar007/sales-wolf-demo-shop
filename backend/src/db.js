/**
 * The one Prisma client. Connects only to this app's own DATABASE_URL.
 *
 * A Postgres connection is a raw TCP socket, not HTTP, so the egress allowlist
 * does not see it — the database host is trusted because it comes from this
 * app's own config, which is exactly why config vars must never be copied
 * across from another app (README, rule 2).
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';

function connectionConfig() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. See .env.example.');
  }
  // Heroku Postgres requires TLS but presents a cert Node won't verify.
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
  return isLocal ? { connectionString } : { connectionString, ssl: { rejectUnauthorized: false } };
}

let client;

export function getPrisma() {
  if (!client) {
    client = new PrismaClient({ adapter: new PrismaPg(connectionConfig()) });
  }
  return client;
}

export const prisma = new Proxy(
  {},
  {
    get(_target, property) {
      return getPrisma()[property];
    },
  },
);

export async function disconnectPrisma() {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}
