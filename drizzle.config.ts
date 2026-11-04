import type { Config } from 'drizzle-kit';

/**
 * Drizzle Kit configuration.
 *
 * The active driver is controlled by DATABASE_DRIVER. Generate migrations with
 *   npm run db:generate
 * Apply them at runtime with
 *   npm run db:migrate     (scripts/db-migrate.mjs, works on both drivers)
 */
export default {
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://sentinel:sentinel@localhost:5432/sentinel_ops',
  },
  strict: true,
  verbose: true,
} satisfies Config;
