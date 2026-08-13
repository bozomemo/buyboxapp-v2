import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'mysql',
  schema: './src/schema/mysql.ts',
  out: './migrations/mysql',
  dbCredentials: {
    url: process.env.MYSQL_URL ?? 'mysql://root:test@localhost:53306/buybox_test',
  },
});
