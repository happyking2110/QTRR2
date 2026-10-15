import { describe, it, expect } from 'vitest';

describe('Database Safety Barrier (S1)', () => {
  it('1. Biến môi trường DATABASE_URL trong quá trình kiểm thử phải trỏ tới database kết thúc bằng _test', () => {
    const dbUrl = process.env.DATABASE_URL;
    expect(dbUrl).toBeDefined();

    const parsed = new URL(dbUrl!);
    const dbName = parsed.pathname.slice(1);

    expect(dbName).toMatch(/_test$/);
    expect(dbName).not.toBe('hsrr');
  });

  it('2. Biến môi trường DATABASE_TEST_URL phải tồn tại và kết thúc bằng _test', () => {
    const testUrl = process.env.DATABASE_TEST_URL;
    expect(testUrl).toBeDefined();

    const parsed = new URL(testUrl!);
    const dbName = parsed.pathname.slice(1);

    expect(dbName).toMatch(/_test$/);
  });
});
