import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  const rootDir = path.resolve(__dirname, '../../');
  const env = {
    ...loadEnv(mode, rootDir, ''),
    ...loadEnv(mode, process.cwd(), ''),
  };
  const testUrl = env.DATABASE_TEST_URL || process.env.DATABASE_TEST_URL;
  if (!testUrl) {
    throw new Error('Thiếu biến môi trường DATABASE_TEST_URL khi chạy kiểm thử');
  }

  const originalDevUrl = env.DATABASE_URL || process.env.DATABASE_URL;
  const parsedTest = new URL(testUrl);
  const testDbName = parsedTest.pathname.slice(1);
  if (!testDbName.endsWith('_test')) {
    throw new Error(
      `Rào chắn an toàn: Cơ sở dữ liệu trong DATABASE_TEST_URL (${testDbName}) phải kết thúc bằng '_test' để tránh ghi đè dữ liệu phát triển`
    );
  }
  if (originalDevUrl) {
    const parsedDev = new URL(originalDevUrl);
    const devDbName = parsedDev.pathname.slice(1);
    if (testDbName === devDbName) {
      throw new Error(
        `Rào chắn an toàn: DATABASE_TEST_URL (${testDbName}) trùng tên cơ sở dữ liệu với DATABASE_URL (${devDbName})`
      );
    }
  }

  // Ghi đè DATABASE_URL sang DATABASE_TEST_URL cho toàn bộ môi trường test
  process.env.DATABASE_URL = testUrl;
  env.DATABASE_URL = testUrl;

  const testMigrateUrl = env.DATABASE_TEST_MIGRATE_URL || process.env.DATABASE_TEST_MIGRATE_URL;
  if (testMigrateUrl) {
    process.env.DATABASE_MIGRATE_URL = testMigrateUrl;
    env.DATABASE_MIGRATE_URL = testMigrateUrl;
  }

  // Gán vào process.env để các module import đọc được ngay
  for (const [k, v] of Object.entries(env)) {
    if (!process.env[k]) {
      process.env[k] = v;
    }
  }

  return {
    test: {
      environment: 'node',
      globals: true,
      passWithNoTests: true,
      fileParallelism: false,
      env,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});
