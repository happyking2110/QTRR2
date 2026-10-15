import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import path from 'path';

/**
 * Chạy toàn bộ migrations từ thư mục migrations lên database được chỉ định bởi migrateUrl
 */
export async function runMigrations(migrateUrl?: string) {
  const url = migrateUrl || process.env.DATABASE_MIGRATE_URL;
  if (!url) {
    throw new Error('Thiếu biến môi trường DATABASE_MIGRATE_URL');
  }

  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql);

  const migrationsFolder = path.resolve(__dirname, './migrations');
  await migrate(db, { migrationsFolder });
  await sql.end();
}

// Chạy trực tiếp qua CLI nếu được gọi trực tiếp
if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  runMigrations()
    .then(() => {
      console.log('Migration completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
