import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import postgres from 'postgres';
import ExcelJS from 'exceljs';
import { runMigrations } from '../db/migrate';
import { createCustomClient } from '../db/client';
import { importCycle } from './cycles';
import { withAudit } from './audit';
import { cycle } from '../db/schema';
import { eq } from 'drizzle-orm';
import { AppError } from '../errors';

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

describe('Kiểm thử dịch vụ importCycle và tính toàn vẹn dữ liệu trên hsrr_test', () => {
  let ownerSql: postgres.Sql;
  let appClient: ReturnType<typeof createCustomClient>;
  const filePath = fs.existsSync(path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx'))
    ? path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx')
    : path.resolve(__dirname, '../../../../../data/RRTY2026.MBF.xlsx');
  const buffer = fs.readFileSync(filePath);

  beforeAll(async () => {
    await runMigrations(testMigrateUrl);
    ownerSql = postgres(testMigrateUrl, { max: 1 });
    appClient = createCustomClient(testAppUrl);

    // Xóa sạch dữ liệu trong hsrr_test trước khi test
    await ownerSql`TRUNCATE TABLE audit_log, unit_assignment, indicator_reading, indicator, action_update, action_task, action_control, action_plan, control_cause, control, impact, cause, residual_assessment, risk_profile, period, session, password_history, app_user, unit, cycle CASCADE`;
  });

  afterAll(async () => {
    if (appClient) await appClient.client.end();
    if (ownerSql) await ownerSql.end();
  });

  it('nhập lần 1: thành công với đúng số lượng bản ghi mục 6', async () => {
    const report = await importCycle(
      {
        year: 2026,
        file: buffer,
        actor: null,
      },
      appClient.db
    );

    expect(report.profilesCount).toBe(4);
    expect(report.causesCount).toBe(16);
    expect(report.impactsCount).toBe(15);
    expect(report.controlsCount).toBe(17);
    expect(report.actionsCount).toBe(10);
    expect(report.actionTasksCount).toBe(10);
    expect(report.kriCount).toBe(9);
    expect(report.kciCount).toBe(12);
    expect(report.autoIndicatorsCount).toBe(16);
    expect(report.manualIndicatorsCount).toBe(5);

    // F9.4: Kiểm tra dòng audit_log tạo ra (đúng 1 dòng với user_id null)
    const audits1 = await ownerSql`
      SELECT * FROM audit_log WHERE entity = 'cycle' AND action = 'import_cycle' AND entity_id = ${report.cycleId}
    `;
    expect(audits1).toHaveLength(1);
    expect(audits1[0].user_id).toBeNull();
  });

  it('nhập lần 2: idempotency - số bản ghi không đổi, 10 action_task không bị nhân đôi, thêm đúng 1 audit_log', async () => {
    const report2 = await importCycle(
      {
        year: 2026,
        file: buffer,
        actor: null,
      },
      appClient.db
    );

    expect(report2.profilesCount).toBe(4);
    expect(report2.causesCount).toBe(16);
    expect(report2.impactsCount).toBe(15);
    expect(report2.controlsCount).toBe(17);
    expect(report2.actionsCount).toBe(10);
    expect(report2.actionTasksCount).toBe(10);

    // F9.4: Mỗi lần import thành công thêm đúng 1 dòng audit_log
    const audits2 = await ownerSql`
      SELECT * FROM audit_log WHERE entity = 'cycle' AND action = 'import_cycle' AND entity_id = ${report2.cycleId}
    `;
    expect(audits2).toHaveLength(2);
    expect(audits2[1].user_id).toBeNull();

    // Kiểm tra trực tiếp bằng SQL trong database
    const [pCount] = await ownerSql`SELECT count(*)::int as count FROM risk_profile`;
    const [cCount] = await ownerSql`SELECT count(*)::int as count FROM cause`;
    const [iCount] = await ownerSql`SELECT count(*)::int as count FROM impact`;
    const [ctrlCount] = await ownerSql`SELECT count(*)::int as count FROM control`;
    const [actCount] = await ownerSql`SELECT count(*)::int as count FROM action_plan`;
    const [tCount] = await ownerSql`SELECT count(*)::int as count FROM action_task`;
    const [indCount] = await ownerSql`SELECT count(*)::int as count FROM indicator`;

    expect(pCount.count).toBe(4);
    expect(cCount.count).toBe(16);
    expect(iCount.count).toBe(15);
    expect(ctrlCount.count).toBe(17);
    expect(actCount.count).toBe(10);
    expect(tCount.count).toBe(10);
    expect(indCount.count).toBe(21);
  });

  it('truy vấn SQL trực tiếp: xác nhận các đặc trưng dữ liệu mục 6', async () => {
    // 5 chỉ số manual có zone_rules IS NULL
    const [manualRows] = await ownerSql`
      SELECT count(*)::int as count FROM indicator WHERE zone_rules IS NULL
    `;
    expect(manualRows.count).toBe(5);

    // 16 chỉ số auto có zone_rules IS NOT NULL
    const [autoRows] = await ownerSql`
      SELECT count(*)::int as count FROM indicator WHERE zone_rules IS NOT NULL
    `;
    expect(autoRows.count).toBe(16);

    // Phân bố period_kind: month = 2, quarter = 18, event = 1
    const [monthRows] = await ownerSql`
      SELECT count(*)::int as count FROM indicator WHERE period_kind = 'month'
    `;
    const [quarterRows] = await ownerSql`
      SELECT count(*)::int as count FROM indicator WHERE period_kind = 'quarter'
    `;
    const [eventRows] = await ownerSql`
      SELECT count(*)::int as count FROM indicator WHERE period_kind = 'event'
    `;
    expect(monthRows.count).toBe(2);
    expect(quarterRows.count).toBe(18);
    expect(eventRows.count).toBe(1);

    // Hạn due_date của 10 action_task: 8 bản ghi 2026-12-31 và 2 bản ghi 2027-03-31
    const [due2026Rows] = await ownerSql`
      SELECT count(*)::int as count FROM action_task WHERE due_date = '2026-12-31'
    `;
    const [due2027Rows] = await ownerSql`
      SELECT count(*)::int as count FROM action_task WHERE due_date = '2027-03-31'
    `;
    expect(due2026Rows.count).toBe(8);
    expect(due2027Rows.count).toBe(2);

    // Kiểm tra controls có đúng 9 mục needs_supplement = true
    const [suppRows] = await ownerSql`
      SELECT count(*)::int as count FROM control WHERE needs_supplement = true
    `;
    expect(suppRows.count).toBe(9);

    // F3: Hợp hai chiều cho control_cause (đúng 19) và action_control (đúng 11)
    const [ccRows] = await ownerSql`SELECT count(*)::int as count FROM control_cause`;
    const [acRows] = await ownerSql`SELECT count(*)::int as count FROM action_control`;
    expect(ccRows.count).toBe(19);
    expect(acRows.count).toBe(11);

  });

  it('từ chối import vào chu kỳ đã archived với mã CYCLE_ARCHIVED', async () => {
    // Chuyển chu kỳ 2026 sang archived
    await appClient.db
      .update(cycle)
      .set({ status: 'archived' })
      .where(eq(cycle.year, 2026));

    try {
      await importCycle(
        {
          year: 2026,
          file: buffer,
          actor: null,
        },
        appClient.db
      );
      expect.fail('Phải ném lỗi AppError khi chu kỳ đã archived');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('CYCLE_ARCHIVED');
    }

    // Khôi phục lại open
    await appClient.db
      .update(cycle)
      .set({ status: 'open' })
      .where(eq(cycle.year, 2026));
  });

  it('file không đọc được (file hỏng): từ chối import và không ghi bản ghi nào', async () => {
    // Tạo chu kỳ mới 2099
    await ownerSql`DELETE FROM cycle WHERE year = 2099`;

    // Giả lập file hỏng bằng buffer không hợp lệ (không phải excel)
    const invalidBuffer = Buffer.from('invalid excel content');

    await expect(
      importCycle(
        {
          year: 2099,
          file: invalidBuffer,
          actor: null,
        },
        appClient.db
      )
    ).rejects.toThrow();

    // Xác nhận cycle 2099 hoàn toàn không tồn tại
    const [c2099] = await ownerSql`SELECT * FROM cycle WHERE year = 2099`;
    expect(c2099).toBeUndefined();
  });

  it('F9.2: test rollback thật - workbook có mã tham chiếu không tồn tại ném IMPORT_INVALID, mọi bảng nội dung rỗng, không có audit_log', async () => {
    // Sao chép workbook thật và sửa một ô tham chiếu thành mã không tồn tại
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    // Tìm ô tham chiếu kiểm soát và sửa thành mã không tồn tại
    let cellModified = false;
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        const str = String(cell.value || '');
        if (str.includes('HD11.R27.KS01') && !cellModified) {
          cell.value = 'HD11.R27.KS99_NONEXISTENT';
          cellModified = true;
        }
      });
    });
    expect(cellModified).toBe(true);
    const badBuffer = Buffer.from(await wb.xlsx.writeBuffer());

    await ownerSql`DELETE FROM cycle WHERE year = 2030`;

    try {
      await importCycle(
        {
          year: 2030,
          file: badBuffer,
          actor: null,
        },
        appClient.db
      );
      expect.fail('Phải ném AppError(IMPORT_INVALID) khi mã tham chiếu không tồn tại');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('IMPORT_INVALID');
    }

    // Xác nhận rollback hoàn toàn: cycle 2030 không tồn tại, bảng con rỗng, không có audit_log
    const [c2030] = await ownerSql`SELECT * FROM cycle WHERE year = 2030`;
    expect(c2030).toBeUndefined();

    const [pCount] = await ownerSql`
      SELECT count(*)::int as count FROM risk_profile p JOIN cycle c ON p.cycle_id = c.id WHERE c.year = 2030
    `;
    expect(pCount.count).toBe(0);

    const [auditCount] = await ownerSql`
      SELECT count(*)::int as count FROM audit_log WHERE entity = 'cycle' AND after->>'year' = '2030'
    `;
    expect(auditCount.count).toBe(0);
  });

  it('F9.3: lỗi giữa transaction (chu kỳ archived) không ghi dở bất kỳ bản ghi nào', async () => {
    // Đảm bảo chu kỳ 2026 đang archived
    await appClient.db
      .update(cycle)
      .set({ status: 'archived' })
      .where(eq(cycle.year, 2026));

    const [causesBefore] = await ownerSql`SELECT count(*)::int as count FROM cause`;

    try {
      await importCycle(
        {
          year: 2026,
          file: buffer,
          actor: null,
        },
        appClient.db
      );
      expect.fail('Phải ném lỗi khi chu kỳ archived');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('CYCLE_ARCHIVED');
    }

    // Số lượng bản ghi trước và sau khi lỗi phải bằng nhau (không bị ghi dở)
    const [causesAfter] = await ownerSql`SELECT count(*)::int as count FROM cause`;
    expect(causesAfter.count).toBe(causesBefore.count);

    // Khôi phục open
    await appClient.db
      .update(cycle)
      .set({ status: 'open' })
      .where(eq(cycle.year, 2026));
  });

  it('F9.5: withAudit hoàn tác toàn bộ khi ghi audit_log lỗi', async () => {
    await ownerSql`DELETE FROM cycle WHERE year = 2040`;

    // Giả lập fn chèn cycle 2040 nhưng auditMeta truyền action null vi phạm NOT NULL của audit_log.action
    const invalidMeta = {
      action: null as unknown as string,
      entity: 'cycle',
    };

    await expect(
      withAudit(
        null,
        invalidMeta,
        async (tx) => {
          await tx.insert(cycle).values({ year: 2040, status: 'open' });
          return { entityId: 'fake-id', result: true };
        },
        appClient.db
      )
    ).rejects.toThrow();

    // Xác nhận cycle 2040 đã bị rollback hoàn toàn
    const [c2040] = await ownerSql`SELECT * FROM cycle WHERE year = 2040`;
    expect(c2040).toBeUndefined();
  });

  it('F4: workbook giả lập có KH không có ngày - import thành công, đầu việc có due_date = null và có cảnh báo', async () => {
    // Dữ liệu giả lập (mock) kiểm thử theo yêu cầu F4 của BRIEF-KE-HOACH-1-SUA-LOI
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('BM06.01');

    // Thông tin chung hồ sơ
    ws.getCell('B7').value = 'Mã HSRR';
    ws.getCell('C7').value = 'HSRRTY_MBF_2028_MOCK.R01';
    ws.getCell('B8').value = 'Mã rủi ro';
    ws.getCell('C8').value = 'MOCK.R01';
    ws.getCell('B15').value = 'Tên rủi ro';
    ws.getCell('C15').value = 'Rủi ro thử nghiệm không có ngày';
    ws.getCell('B16').value = 'Mô tả rủi ro';
    ws.getCell('C16').value = 'Mô tả rủi ro thử nghiệm';

    // Rủi ro tiềm ẩn
    ws.getCell('K20').value = 'Mức độ ảnh hưởng';
    ws.getCell('M20').value = 'Khả năng xảy ra';
    ws.getCell('O20').value = 'Mức độ rủi ro';
    ws.getCell('K21').value = 'Nghiêm trọng';
    ws.getCell('M21').value = 'Nhiều khả năng xảy ra';
    ws.getCell('O21').value = 'Cao';

    // 1. Nguyên nhân
    ws.getCell('C25').value = 'Mã nguyên nhân';
    ws.getCell('E25').value = 'Nhóm nguyên nhân';
    ws.getCell('F25').value = 'Mô tả nguyên nhân';
    ws.getCell('O25').value = 'Mã kiểm soát hiện tại';
    ws.getCell('C26').value = 'MOCK.R01.NN01';
    ws.getCell('E26').value = 'Nhóm 1';
    ws.getCell('F26').value = 'Mô tả NN1';
    ws.getCell('O26').value = 'MOCK.R01.KS01';

    // 2. Ảnh hưởng
    ws.getCell('C30').value = 'Mã ảnh hưởng';
    ws.getCell('E30').value = 'Nhóm ảnh hưởng';
    ws.getCell('G30').value = 'Mô tả ảnh hưởng';
    ws.getCell('N30').value = 'Mức độ ảnh hưởng';
    ws.getCell('C31').value = 'MOCK.R01.AH01';
    ws.getCell('E31').value = 'Nhóm 1';
    ws.getCell('G31').value = 'Mô tả AH1';
    ws.getCell('N31').value = 'Nghiêm trọng';

    // 3. Kiểm soát
    ws.getCell('C35').value = 'Mã kiểm soát';
    ws.getCell('E35').value = 'Mô tả kiểm soát';
    ws.getCell('G35').value = 'Chủ kiểm soát';
    ws.getCell('H35').value = 'Tần suất kiểm soát';
    ws.getCell('I35').value = 'Mục tiêu kiểm soát';
    ws.getCell('J35').value = 'Cách thức kiểm soát';
    ws.getCell('K35').value = 'Hiệu quả thiết kế kiểm soát';
    ws.getCell('L35').value = 'Hiệu quả vận hành kiểm soát';
    ws.getCell('M35').value = 'Hiệu quả tổng thể kiểm soát';
    ws.getCell('N35').value = 'Bổ sung kiểm soát';
    ws.getCell('O35').value = 'Mã kế hoạch hành động';
    ws.getCell('P35').value = 'Tham chiếu đến Nguyên nhân';
    ws.getCell('C36').value = 'MOCK.R01.KS01';
    ws.getCell('E36').value = 'Mô tả KS1';
    ws.getCell('G36').value = 'Chủ 1';
    ws.getCell('H36').value = 'Hằng năm';
    ws.getCell('I36').value = 'Phòng ngừa';
    ws.getCell('J36').value = 'Thủ công';
    ws.getCell('K36').value = 'Tốt';
    ws.getCell('L36').value = 'Tốt';
    ws.getCell('M36').value = 'Tốt';
    ws.getCell('N36').value = 'Không';
    ws.getCell('O36').value = 'MOCK.R01.KH01';
    ws.getCell('P36').value = 'MOCK.R01.NN01';

    // 4. Kế hoạch hành động (KHÔNG CÓ NGÀY HẠN)
    ws.getCell('C40').value = 'Mã Kế hoạch hành động';
    ws.getCell('E40').value = 'Phương án xử lý/Kế hoạch hành động';
    ws.getCell('K40').value = 'Trách nhiệm';
    ws.getCell('L40').value = 'Đầu ra yêu cầu';
    ws.getCell('N40').value = 'Ngày hoàn thành dự kiến';
    ws.getCell('P40').value = 'Tham chiếu đến Kiểm soát hiện tại';
    ws.getCell('C41').value = 'MOCK.R01.KH01';
    ws.getCell('E41').value = 'Mô tả KH1';
    ws.getCell('K41').value = 'Ban 4';
    ws.getCell('L41').value = 'Đầu ra 1';
    ws.getCell('N41').value = 'Theo tiến độ dự án chưa chốt ngày'; // Không có ngày
    ws.getCell('P41').value = 'MOCK.R01.KS01';

    // 5. KRI
    ws.getCell('C45').value = 'Mã KRI';
    ws.getCell('E45').value = 'Tên chỉ số KRI';
    ws.getCell('H45').value = 'Cách tính KRI';
    ws.getCell('L45').value = 'Tần suất đo lường';
    ws.getCell('M45').value = 'Ngưỡng KRI';
    ws.getCell('C46').value = 'MOCK.R01.KRI01';
    ws.getCell('E46').value = 'KRI 1';
    ws.getCell('H46').value = 'Công thức';
    ws.getCell('L46').value = 'Quý';
    ws.getCell('M46').value = '< 5%';
    ws.getCell('N46').value = '5% - 10%';
    ws.getCell('O46').value = '> 10%';

    // 6. KCI
    ws.getCell('C50').value = 'Mã KCI';
    ws.getCell('E50').value = 'Tên chỉ số KCI';
    ws.getCell('H50').value = 'Cách tính KCI';
    ws.getCell('L50').value = 'Tần suất đo lường';
    ws.getCell('M50').value = 'Ngưỡng KCI';
    ws.getCell('C51').value = 'MOCK.R01.KCI01';
    ws.getCell('E51').value = 'KCI 1';
    ws.getCell('H51').value = 'Công thức';
    ws.getCell('L51').value = 'Quý';
    ws.getCell('M51').value = '< 5%';
    ws.getCell('N51').value = '5% - 10%';
    ws.getCell('O51').value = '> 10%';

    const mockBuffer = Buffer.from(await wb.xlsx.writeBuffer());

    // Dọn sạch chu kỳ 2028 nếu có
    await ownerSql`DELETE FROM cycle WHERE year = 2028`;

    const report = await importCycle(
      {
        year: 2028,
        file: mockBuffer,
        actor: null,
      },
      appClient.db
    );

    expect(report.profilesCount).toBe(1);
    expect(report.actionsCount).toBe(1);
    expect(report.actionTasksCount).toBe(1);

    // Có cảnh báo "Kế hoạch hành động không có ngày hoàn thành"
    const noDateWarning = report.warnings.find((w) =>
      w.message.includes('không có ngày hoàn thành')
    );
    expect(noDateWarning).toBeDefined();
    expect(noDateWarning?.itemCode).toBe('MOCK.R01.KH01');

    // Truy vấn trực tiếp DB: due_date trong bảng action_task phải là null (không fallback tự điền ngày)
    const [taskRow] = await ownerSql`
      SELECT at.due_date 
      FROM action_task at
      JOIN action_plan ap ON at.action_id = ap.id
      WHERE ap.code = 'MOCK.R01.KH01'
    `;
    expect(taskRow).toBeDefined();
    expect(taskRow.due_date).toBeNull();
  });

  it('F5: importCycle với tần suất lạ (workbook giả lập) ném AppError(IMPORT_INVALID) và không ghi bản ghi nào', async () => {
    // Mock workbook kiểm thử tần suất lạ theo F5
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('BM06.01');

    ws.getCell('B7').value = 'Mã HSRR';
    ws.getCell('C7').value = 'HSRRTY_MBF_2029_FREQ.R01';
    ws.getCell('B8').value = 'Mã rủi ro';
    ws.getCell('C8').value = 'FREQ.R01';
    ws.getCell('B15').value = 'Tên rủi ro';
    ws.getCell('C15').value = 'Rủi ro tần suất lạ';
    ws.getCell('B16').value = 'Mô tả rủi ro';
    ws.getCell('C16').value = 'Mô tả';

    ws.getCell('K20').value = 'Mức độ ảnh hưởng';
    ws.getCell('M20').value = 'Khả năng xảy ra';
    ws.getCell('O20').value = 'Mức độ rủi ro';
    ws.getCell('K21').value = 'Nghiêm trọng';
    ws.getCell('M21').value = 'Nhiều khả năng xảy ra';
    ws.getCell('O21').value = 'Cao';

    ws.getCell('C25').value = 'Mã nguyên nhân';
    ws.getCell('E25').value = 'Nhóm nguyên nhân';
    ws.getCell('F25').value = 'Mô tả nguyên nhân';
    ws.getCell('O25').value = 'Mã kiểm soát hiện tại';
    ws.getCell('C26').value = 'FREQ.R01.NN01';
    ws.getCell('E26').value = 'Nhóm 1';
    ws.getCell('F26').value = 'Mô tả NN1';
    ws.getCell('O26').value = 'FREQ.R01.KS01';

    ws.getCell('C30').value = 'Mã ảnh hưởng';
    ws.getCell('E30').value = 'Nhóm ảnh hưởng';
    ws.getCell('G30').value = 'Mô tả ảnh hưởng';
    ws.getCell('N30').value = 'Mức độ ảnh hưởng';
    ws.getCell('C31').value = 'FREQ.R01.AH01';
    ws.getCell('E31').value = 'Nhóm 1';
    ws.getCell('G31').value = 'Mô tả AH1';
    ws.getCell('N31').value = 'Nghiêm trọng';

    ws.getCell('C35').value = 'Mã kiểm soát';
    ws.getCell('E35').value = 'Mô tả kiểm soát';
    ws.getCell('G35').value = 'Chủ kiểm soát';
    ws.getCell('H35').value = 'Tần suất kiểm soát';
    ws.getCell('I35').value = 'Mục tiêu kiểm soát';
    ws.getCell('J35').value = 'Cách thức kiểm soát';
    ws.getCell('K35').value = 'Hiệu quả thiết kế kiểm soát';
    ws.getCell('L35').value = 'Hiệu quả vận hành kiểm soát';
    ws.getCell('M35').value = 'Hiệu quả tổng thể kiểm soát';
    ws.getCell('N35').value = 'Bổ sung kiểm soát';
    ws.getCell('O35').value = 'Mã kế hoạch hành động';
    ws.getCell('P35').value = 'Tham chiếu đến Nguyên nhân';
    ws.getCell('C36').value = 'FREQ.R01.KS01';
    ws.getCell('E36').value = 'Mô tả KS1';
    ws.getCell('G36').value = 'Chủ 1';
    ws.getCell('H36').value = 'Hằng năm';
    ws.getCell('I36').value = 'Phòng ngừa';
    ws.getCell('J36').value = 'Thủ công';
    ws.getCell('K36').value = 'Tốt';
    ws.getCell('L36').value = 'Tốt';
    ws.getCell('M36').value = 'Tốt';
    ws.getCell('N36').value = 'Không';
    ws.getCell('O36').value = 'FREQ.R01.KH01';
    ws.getCell('P36').value = 'FREQ.R01.NN01';

    ws.getCell('C40').value = 'Mã Kế hoạch hành động';
    ws.getCell('E40').value = 'Phương án xử lý/Kế hoạch hành động';
    ws.getCell('K40').value = 'Trách nhiệm';
    ws.getCell('L40').value = 'Đầu ra yêu cầu';
    ws.getCell('N40').value = 'Ngày hoàn thành dự kiến';
    ws.getCell('P40').value = 'Tham chiếu đến Kiểm soát hiện tại';
    ws.getCell('C41').value = 'FREQ.R01.KH01';
    ws.getCell('E41').value = 'Mô tả KH1';
    ws.getCell('K41').value = 'Ban 4';
    ws.getCell('L41').value = 'Đầu ra 1';
    ws.getCell('N41').value = '31/12/2029';
    ws.getCell('P41').value = 'FREQ.R01.KS01';

    // KRI với tần suất lạ không hợp lệ: "Hai tháng một lần"
    ws.getCell('C45').value = 'Mã KRI';
    ws.getCell('E45').value = 'Tên chỉ số KRI';
    ws.getCell('H45').value = 'Cách tính KRI';
    ws.getCell('L45').value = 'Tần suất đo lường';
    ws.getCell('M45').value = 'Ngưỡng KRI';
    ws.getCell('C46').value = 'FREQ.R01.KRI01';
    ws.getCell('E46').value = 'KRI 1';
    ws.getCell('H46').value = 'Công thức';
    ws.getCell('L46').value = 'Hai tháng một lần'; // Lạ!
    ws.getCell('M46').value = '< 5%';
    ws.getCell('N46').value = '5% - 10%';
    ws.getCell('O46').value = '> 10%';

    ws.getCell('C50').value = 'Mã KCI';
    ws.getCell('E50').value = 'Tên chỉ số KCI';
    ws.getCell('H50').value = 'Cách tính KCI';
    ws.getCell('L50').value = 'Tần suất đo lường';
    ws.getCell('M50').value = 'Ngưỡng KCI';
    ws.getCell('C51').value = 'FREQ.R01.KCI01';
    ws.getCell('E51').value = 'KCI 1';
    ws.getCell('H51').value = 'Công thức';
    ws.getCell('L51').value = 'Quý';
    ws.getCell('M51').value = '< 5%';
    ws.getCell('N51').value = '5% - 10%';
    ws.getCell('O51').value = '> 10%';

    const mockBuffer = Buffer.from(await wb.xlsx.writeBuffer());

    await ownerSql`DELETE FROM cycle WHERE year = 2029`;

    try {
      await importCycle(
        {
          year: 2029,
          file: mockBuffer,
          actor: null,
        },
        appClient.db
      );
      expect.fail('Phải ném AppError khi chỉ số có tần suất lạ');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.code).toBe('IMPORT_INVALID');
      expect(appErr.message).toContain('FREQ.R01.KRI01');
      expect(appErr.message).toContain('Hai tháng một lần');
    }

    // Xác nhận không ghi bất kỳ bản ghi nào vào database (rollback transaction)
    const [c2029] = await ownerSql`SELECT * FROM cycle WHERE year = 2029`;
    expect(c2029).toBeUndefined();
    const [pRows] = await ownerSql`SELECT count(*)::int as count FROM risk_profile WHERE risk_code = 'FREQ.R01'`;
    expect(pRows.count).toBe(0);
  });
});

