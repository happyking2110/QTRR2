import { defineConfig } from 'drizzle-kit';

const migrateUrl = process.env.DATABASE_MIGRATE_URL;
if (!migrateUrl) {
  throw new Error('Thiếu biến môi trường DATABASE_MIGRATE_URL');
}

export default defineConfig({
  schema: './src/server/db/schema.ts',
  out: './src/server/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: migrateUrl,
  },
});
