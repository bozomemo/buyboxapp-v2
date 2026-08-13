import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/postgres.ts',
  out: './migrations/postgres',
  dbCredentials: {
    url: process.env.POSTGRES_URL ?? 'postgres://postgres:test@localhost:55432/buybox_test',
  },
});
