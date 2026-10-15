import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { createCustomClient, type CustomClient } from '../db/client';
import { appUser, auditLog } from '../db/schema';
import { listAuditLogs } from './audit';
import { hashPassword } from '../auth/password';
import type { Actor } from '../types';

function getRequiredTestUrl(varName: string): string {
  const url = process.env[varName];
  if (!url) {
    throw new Error(`Thiếu biến môi trường ${varName}`);
  }
  const parsed = new URL(url);
  const dbName = parsed.pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Rào chắn an toàn: Cơ sở dữ liệu trong ${varName} (${dbName}) phải kết thúc bằng '_test' để tránh ghi đè dữ liệu thật`
    );
  }
  return url;
}

const testMigrateUrl = getRequiredTestUrl('DATABASE_TEST_MIGRATE_URL');
const testAppUrl = getRequiredTestUrl('DATABASE_TEST_URL');

describe('audit-3b6.test.ts - Kế hoạch 3B.6: Nhật ký (Audit Log)', () => {
  let ownerSql: postgres.Sql;
  let appClient: CustomClient;

  let testUserId1: string;
  let testUserId2: string;

  beforeAll(async () => {
    ownerSql = postgres(testMigrateUrl, { max: 1 });
    appClient = createCustomClient(testAppUrl);

    await ownerSql`TRUNCATE TABLE audit_log, unit_assignment, indicator_reading, indicator, action_update, action_task, action_control, action_plan, control_cause, control, impact, cause, residual_assessment, risk_profile, period, session, password_history, app_user, unit, cycle CASCADE`;

    const passwordHash = await hashPassword('AdminPass!2026');
    const [u1] = await appClient.db
      .insert(appUser)
      .values({
        email: 'nguyenvana_audit@mobifone.vn',
        fullName: 'Nguyễn Văn A',
        role: 'admin',
        passwordHash,
        isActive: true,
        mustChangePassword: false,
      })
      .returning();
    testUserId1 = u1.id;

    const [u2] = await appClient.db
      .insert(appUser)
      .values({
        email: 'tranthib_audit@mobifone.vn',
        fullName: 'Trần Thị B',
        role: 'ban4',
        passwordHash,
        isActive: true,
        mustChangePassword: false,
      })
      .returning();
    testUserId2 = u2.id;

    // Chèn 10 bản ghi nhật ký với thời gian và hành động khác nhau
    for (let i = 1; i <= 10; i++) {
      const isEven = i % 2 === 0;
      await appClient.db.insert(auditLog).values({
        userId: isEven ? testUserId2 : testUserId1,
        action: isEven ? 'submit_reading' : 'approve_submission',
        entity: isEven ? 'indicator_reading' : 'action_update',
        entityId: `entity-${i}`,
        before: { step: i - 1 },
        after: { step: i },
        ip: `192.168.1.${i}`,
        // Giả lập ngày: i = 1..5 vào 2026-10-10, i = 6..10 vào 2026-10-12
        at: new Date(
          isEven
            ? '2026-10-10T08:00:00.000Z'
            : '2026-10-12T08:00:00.000Z'
        ),
      });
    }
  });

  afterAll(async () => {
    if (appClient) await appClient.client.end();
    if (ownerSql) await ownerSql.end();
  });

  it('1. Phân trang con trỏ (cursor pagination) đi hết không trùng, không sót', async () => {
    const page1 = await listAuditLogs({ limit: 4 }, appClient.db);
    expect(page1.items.length).toBe(4);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await listAuditLogs(
      { limit: 4, cursor: page1.nextCursor! },
      appClient.db
    );
    expect(page2.items.length).toBe(4);
    expect(page2.nextCursor).not.toBeNull();

    const page3 = await listAuditLogs(
      { limit: 4, cursor: page2.nextCursor! },
      appClient.db
    );
    expect(page3.items.length).toBe(2);
    expect(page3.nextCursor).toBeNull();

    // Tập hợp ID phải đủ 10 và không có trùng lặp
    const allIds = [
      ...page1.items.map((i) => i.id),
      ...page2.items.map((i) => i.id),
      ...page3.items.map((i) => i.id),
    ];
    expect(allIds.length).toBe(10);
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(10);

    // Sắp xếp giảm dần theo id
    for (let i = 0; i < allIds.length - 1; i++) {
      expect(Number(allIds[i])).toBeGreaterThan(Number(allIds[i + 1]));
    }
  });

  it('2. Bộ lọc theo hành động (action) và thực thể (entity)', async () => {
    const byAction = await listAuditLogs(
      { action: 'submit_reading' },
      appClient.db
    );
    expect(byAction.items.length).toBe(5);
    for (const it of byAction.items) {
      expect(it.action).toBe('submit_reading');
    }

    const byEntity = await listAuditLogs(
      { entity: 'action_update' },
      appClient.db
    );
    expect(byEntity.items.length).toBe(5);
    for (const it of byEntity.items) {
      expect(it.entity).toBe('action_update');
    }
  });

  it('3. Bộ lọc theo người thực hiện (actor: email hoặc họ tên, không phân biệt hoa thường)', async () => {
    // Tìm theo email Nguyễn Văn A
    const byEmail = await listAuditLogs(
      { actor: 'nguyenvana' },
      appClient.db
    );
    expect(byEmail.items.length).toBe(5);
    for (const it of byEmail.items) {
      expect(it.user?.email).toContain('nguyenvana_audit@mobifone.vn');
    }

    // Tìm theo họ tên không dấu / chữ hoa Trần Thị B
    const byName = await listAuditLogs(
      { actor: 'Trần Thị B' },
      appClient.db
    );
    expect(byName.items.length).toBe(5);
    for (const it of byName.items) {
      expect(it.user?.fullName).toBe('Trần Thị B');
    }
  });

  it('4. Bộ lọc theo khoảng ngày (from, to tính theo giờ Asia/Ho_Chi_Minh)', async () => {
    // 2026-10-10
    const pageOct10 = await listAuditLogs(
      { from: '2026-10-10', to: '2026-10-10' },
      appClient.db
    );
    expect(pageOct10.items.length).toBe(5);

    // 2026-10-12
    const pageOct12 = await listAuditLogs(
      { from: '2026-10-12', to: '2026-10-12' },
      appClient.db
    );
    expect(pageOct12.items.length).toBe(5);

    // Ngày không có log
    const pageEmpty = await listAuditLogs(
      { from: '2026-10-11', to: '2026-10-11' },
      appClient.db
    );
    expect(pageEmpty.items.length).toBe(0);
  });
});
