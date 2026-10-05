import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

// Same .env the server reads (repo root), so `prisma migrate` and the app can
// never disagree about which database they mean.
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node src/seed/run.js',
  },
  datasource: {
    // `prisma generate` runs at build time, where no database exists yet.
    url: process.env.DATABASE_URL ?? '',
  },
});
