import { describe, it, expect } from 'vitest';
import { db } from '../db/client';
import { unit, auditLog } from '../db/schema';
import { seedUnits, upsertUnit, INITIAL_UNITS } from './units';
import { eq, sql } from 'drizzle-orm';

describe('Units Service (3A.6)', () => {
  it('seedUnits tạo đúng 7 đơn vị ban đầu và chạy lại không nhân đôi', async () => {
    // Chạy lần 1
    const unitsFirst = await seedUnits(db);
    expect(unitsFirst).toHaveLength(7);

    // Chạy lần 2
    const unitsSecond = await seedUnits(db);
    expect(unitsSecond).toHaveLength(7);

    // Đếm trong DB
    const [dbCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(unit)
      .where(sql`${unit.code} in ${INITIAL_UNITS.map((u) => u.code)}`);

    expect(dbCount.count).toBe(7);

    // Kiểm tra audit log
    const [log] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'seed_units'))
      .orderBy(sql`${auditLog.at} desc`)
      .limit(1);

    expect(log).toBeDefined();
    expect(log.entity).toBe('unit');
    expect((log.after as any)?.count).toBe(7);
  });

  it('upsertUnit tạo mới hoặc cập nhật đơn vị, ghi audit log', async () => {
    const code = 'TEST_DEP_' + Math.floor(Math.random() * 10000);

    // Tạo mới
    const created = await upsertUnit(
      code,
      { name: 'Phòng Thử Nghiệm', kind: 'department' },
      { actor: null, ip: '127.0.0.1' },
      db
    );

    expect(created.code).toBe(code);
    expect(created.name).toBe('Phòng Thử Nghiệm');
    expect(created.kind).toBe('department');

    // Sửa
    const updated = await upsertUnit(
      code,
      { name: 'Phòng Thử Nghiệm Đổi Tên', kind: 'department' },
      { actor: null, ip: '127.0.0.1' },
      db
    );

    expect(updated.name).toBe('Phòng Thử Nghiệm Đổi Tên');

    // Audit log
    const logs = await db
      .select()
      .from(auditLog)
      .where(sql`${auditLog.action} = 'upsert_unit' AND ${auditLog.entityId} = ${code}`)
      .orderBy(sql`${auditLog.at} desc`);

    expect(logs.length).toBeGreaterThanOrEqual(2);
    expect((logs[0].after as any)?.name).toBe('Phòng Thử Nghiệm Đổi Tên');
    expect((logs[1].after as any)?.name).toBe('Phòng Thử Nghiệm');
  });

  it('upsertUnit từ chối mã không đúng định dạng', async () => {
    await expect(
      upsertUnit(
        'invalid-code-123',
        { name: 'Sai mã', kind: 'department' },
        { actor: null },
        db
      )
    ).rejects.toThrow();
  });
});
