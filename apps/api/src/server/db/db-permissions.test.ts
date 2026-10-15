import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { runMigrations } from './migrate';

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

describe('Kiểm thử phân quyền cơ sở dữ liệu và ràng buộc duy nhất trên hsrr_test', () => {
  let appSql: postgres.Sql;
  let ownerSql: postgres.Sql;

  beforeAll(async () => {
    // 1. Chạy migration trên database hsrr_test bằng tài khoản hsrr_owner
    await runMigrations(testMigrateUrl);

    ownerSql = postgres(testMigrateUrl, { max: 1 });
    appSql = postgres(testAppUrl, { max: 1 });

    // Dọn dẹp dữ liệu cũ trong hsrr_test
    await ownerSql`TRUNCATE TABLE audit_log, unit_assignment, indicator_reading, indicator, action_update, action_task, action_control, action_plan, control_cause, control, impact, cause, residual_assessment, risk_profile, period, session, password_history, app_user, unit, cycle CASCADE`;
  });

  afterAll(async () => {
    if (appSql) await appSql.end();
    if (ownerSql) await ownerSql.end();
  });

  it('hsrr_app có quyền INSERT vào audit_log', async () => {
    const rows = await appSql`
      INSERT INTO audit_log (action, entity, entity_id)
      VALUES ('test_action', 'test_entity', 'test_1')
      RETURNING id, action, entity
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe('test_action');
    expect(rows[0].entity).toBe('test_entity');
  });

  it('hsrr_app BỊ TỪ CHỐI khi UPDATE trên audit_log (bất biến nhật ký)', async () => {
    let errorOccurred = false;
    let errorCode = '';

    try {
      await appSql`
        UPDATE audit_log
        SET action = 'tampered_action'
        WHERE entity_id = 'test_1'
      `;
    } catch (err: unknown) {
      errorOccurred = true;
      if (err && typeof err === 'object' && 'code' in err) {
        errorCode = String(err.code);
      }
    }

    expect(errorOccurred).toBe(true);
    // 42501: insufficient_privilege
    expect(errorCode).toBe('42501');
  });

  it('hsrr_app BỊ TỪ CHỐI khi DELETE trên audit_log (bất biến nhật ký)', async () => {
    let errorOccurred = false;
    let errorCode = '';

    try {
      await appSql`
        DELETE FROM audit_log
        WHERE entity_id = 'test_1'
      `;
    } catch (err: unknown) {
      errorOccurred = true;
      if (err && typeof err === 'object' && 'code' in err) {
        errorCode = String(err.code);
      }
    }

    expect(errorOccurred).toBe(true);
    // 42501: insufficient_privilege
    expect(errorCode).toBe('42501');
  });

  it('hsrr_app có đầy đủ quyền SELECT, INSERT, UPDATE, DELETE trên bảng nội dung', async () => {
    // 1. INSERT cycle
    const [insertedCycle] = await appSql`
      INSERT INTO cycle (year, status)
      VALUES (2099, 'open')
      RETURNING id, year, status
    `;
    expect(insertedCycle.year).toBe(2099);

    // 2. UPDATE cycle
    const [updatedCycle] = await appSql`
      UPDATE cycle
      SET status = 'archived'
      WHERE id = ${insertedCycle.id}
      RETURNING status
    `;
    expect(updatedCycle.status).toBe('archived');

    // 3. SELECT cycle
    const selected = await appSql`
      SELECT * FROM cycle WHERE id = ${insertedCycle.id}
    `;
    expect(selected.length).toBe(1);

    // 4. DELETE cycle
    await appSql`
      DELETE FROM cycle WHERE id = ${insertedCycle.id}
    `;
    const checkDeleted = await appSql`
      SELECT * FROM cycle WHERE id = ${insertedCycle.id}
    `;
    expect(checkDeleted.length).toBe(0);
  });

  it('kiểm tra ràng buộc duy nhất (cycle_id, risk_code) trên risk_profile', async () => {
    const [c] = await appSql`
      INSERT INTO cycle (year, status)
      VALUES (2026, 'open')
      RETURNING id
    `;

    // Chèn hồ sơ rủi ro lần 1
    await appSql`
      INSERT INTO risk_profile (
        cycle_id, risk_code, hsrr_code, name, risk_type, risk_zone, risk_group,
        owner, related_activity, prepared_by_unit, description,
        inherent_impact, inherent_likelihood, inherent_level
      ) VALUES (
        ${c.id}, 'HD11.R27', 'HSRRTY_MBF_2026_HD11.R27', 'Rủi ro thử nghiệm',
        'Chiến lược', 'Vàng', 'Quản trị', 'Ban TGĐ', 'Hoạt động kinh doanh',
        'Ban 4', 'Mô tả rủi ro', 'Nghiêm trọng', 'Nhiều khả năng xảy ra', 'Cao'
      )
    `;

    // Chèn hồ sơ rủi ro lần 2 cùng cycle_id và cùng risk_code -> Phải ném lỗi 23505
    let errorOccurred = false;
    let errorCode = '';

    try {
      await appSql`
        INSERT INTO risk_profile (
          cycle_id, risk_code, hsrr_code, name, risk_type, risk_zone, risk_group,
          owner, related_activity, prepared_by_unit, description,
          inherent_impact, inherent_likelihood, inherent_level
        ) VALUES (
          ${c.id}, 'HD11.R27', 'HSRRTY_MBF_2026_HD11.R27_DUPLICATE', 'Rủi ro trùng lặp',
          'Chiến lược', 'Vàng', 'Quản trị', 'Ban TGĐ', 'Hoạt động kinh doanh',
          'Ban 4', 'Mô tả rủi ro 2', 'Nghiêm trọng', 'Nhiều khả năng xảy ra', 'Cao'
        )
      `;
    } catch (err: unknown) {
      errorOccurred = true;
      if (err && typeof err === 'object' && 'code' in err) {
        errorCode = String(err.code);
      }
    }

    expect(errorOccurred).toBe(true);
    // 23505: unique_violation
    expect(errorCode).toBe('23505');
  });

  it('kiểm tra ràng buộc duy nhất (profile_id, code) trên bảng con (cause)', async () => {
    const [profile] = await appSql`
      SELECT id FROM risk_profile WHERE risk_code = 'HD11.R27'
    `;

    // Chèn nguyên nhân lần 1
    await appSql`
      INSERT INTO cause (profile_id, code, cause_group, description)
      VALUES (${profile.id}, 'HD11.R27.NN01', 'Hệ thống', 'Mô tả NN 1')
    `;

    // Chèn nguyên nhân lần 2 cùng profile_id và code
    let errorOccurred = false;
    let errorCode = '';

    try {
      await appSql`
        INSERT INTO cause (profile_id, code, cause_group, description)
        VALUES (${profile.id}, 'HD11.R27.NN01', 'Quy trình', 'Mô tả NN trùng mã')
      `;
    } catch (err: unknown) {
      errorOccurred = true;
      if (err && typeof err === 'object' && 'code' in err) {
        errorCode = String(err.code);
      }
    }

    expect(errorOccurred).toBe(true);
    expect(errorCode).toBe('23505');
  });
});
