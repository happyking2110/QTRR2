import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('Thiếu biến môi trường DATABASE_URL');
}

// Rào chắn an toàn: Khi chạy kiểm thử, bắt buộc cơ sở dữ liệu phải kết thúc bằng '_test'
if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
  const parsed = new URL(connectionString);
  const dbName = parsed.pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Rào chắn an toàn: Khi chạy kiểm thử, DATABASE_URL (${dbName}) phải kết thúc bằng '_test' để tránh ghi đè dữ liệu phát triển`
    );
  }
}

// Tránh rò rỉ connection pool khi phát triển trong môi trường Next.js hot-reload
const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

export const conn = globalForDb.conn ?? postgres(connectionString);
if (process.env.NODE_ENV !== 'production') {
  globalForDb.conn = conn;
}

export const db = drizzle(conn, { schema });
export const defaultDb = db;
export type DbType = typeof db;
export const DATABASE_DB = 'DATABASE_DB';

export function getDb(): DbType {
  return db;
}

/**
 * Tạo kết nối riêng biệt theo URL chỉ định (ví dụ hsrr_owner cho migration hoặc hsrr_test cho test)
 */
export function createCustomClient(url: string) {
  const client = postgres(url, { max: 1 });
  const customDb = drizzle(client, { schema });
  return { client, db: customDb };
}

export { schema };
