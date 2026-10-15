import fs from 'fs';
import path from 'path';
import { conn } from '../src/server/db/client';
import { appSetting } from '../src/server/db/schema';
import { importCycle } from '../src/server/services/cycles';
import { seedInitialPeriods } from '../src/server/services/periods';
import { seedUnits } from '../src/server/services/units';
import { withAudit } from '../src/server/services/audit';
import { readWorkbook } from '../src/lib/import/read-workbook';
import { db } from '../src/server/db/client';

function defaultExcelPath() {
  const rootCandidate = path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx');
  if (fs.existsSync(rootCandidate)) return rootCandidate;
  const relativeCandidate = path.resolve(__dirname, '../../../data/RRTY2026.MBF.xlsx');
  if (fs.existsSync(relativeCandidate)) return relativeCandidate;
  return rootCandidate;
}

// Đọc tham số từ dòng lệnh: --file <path> và --year <number>
function parseArgs() {
  const args = process.argv.slice(2);
  let filePath = defaultExcelPath();
  let year = 2026;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) {
      filePath = path.resolve(process.cwd(), args[i + 1]);
      i++;
    } else if (args[i] === '--year' && args[i + 1]) {
      year = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return { filePath, year };
}

async function seedSettings() {
  const defaultSettings = [
    { key: 'risk.slow_days', value: 60 },
    { key: 'risk.slow_progress', value: 70 },
    { key: 'risk.stale_days', value: 90 },
    { key: 'period.due_day', value: 10 },
  ];

  await withAudit(
    null,
    { action: 'seed_settings', entity: 'app_setting' },
    async (tx) => {
      for (const s of defaultSettings) {
        await tx
          .insert(appSetting)
          .values({
            key: s.key,
            value: s.value,
          })
          .onConflictDoNothing();
      }
      return {
        entityId: 'default_settings',
        after: defaultSettings,
        result: true,
      };
    }
  );
}

async function main() {
  const { filePath, year } = parseArgs();

  console.log(`=== BẮT ĐẦU IMPORT CHU KỲ QUẢN LÝ RỦI RO ===`);
  console.log(`- Tệp nguồn: ${filePath}`);
  console.log(`- Năm chu kỳ: ${year}`);

  if (!fs.existsSync(filePath)) {
    console.error(`Lỗi: Không tìm thấy tệp ${filePath}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(filePath);

  // 1. Đọc workbook trực tiếp từ tệp để lấy số kỳ vọng (không hardcode số)
  const workbookProfiles = await readWorkbook(buffer);

  let expectedControlCause = 0;
  let expectedActionControl = 0;
  for (const p of workbookProfiles) {
    const ccPairs = new Set<string>();
    for (const k of p.controls) {
      for (const c of k.causeCodes) ccPairs.add(`${k.code}|${c}`);
    }
    for (const c of p.causes) {
      for (const k of c.controlCodes) ccPairs.add(`${k}|${c.code}`);
    }
    expectedControlCause += ccPairs.size;

    const acPairs = new Set<string>();
    for (const a of p.actions) {
      for (const k of a.controlCodes) acPairs.add(`${a.code}|${k}`);
    }
    for (const k of p.controls) {
      for (const a of k.actionCodes) acPairs.add(`${a}|${k.code}`);
    }
    expectedActionControl += acPairs.size;
  }

  const expectedCounts = {
    profiles: workbookProfiles.length,
    causes: workbookProfiles.reduce((sum, p) => sum + p.causes.length, 0),
    impacts: workbookProfiles.reduce((sum, p) => sum + p.impacts.length, 0),
    controls: workbookProfiles.reduce((sum, p) => sum + p.controls.length, 0),
    actions: workbookProfiles.reduce((sum, p) => sum + p.actions.length, 0),
    actionTasks: workbookProfiles.reduce((sum, p) => sum + p.actions.length, 0),
    kri: workbookProfiles.reduce((sum, p) => sum + p.indicators.filter((i) => i.kind === 'kri').length, 0),
    kci: workbookProfiles.reduce((sum, p) => sum + p.indicators.filter((i) => i.kind === 'kci').length, 0),
    controlCause: expectedControlCause,
    actionControl: expectedActionControl,
  };

  // 2. Thực hiện import qua importCycle
  const report = await importCycle({
    year,
    file: buffer,
    actor: null,
  });

  // 3. Ghi app_setting qua withAudit
  await seedSettings();

  // 4. Khởi tạo các kỳ báo cáo ban đầu qua seedInitialPeriods
  const cycleId = report.cycleId;
  const seededPeriods = await seedInitialPeriods(cycleId);
  console.log(`- Đã thiết lập ${seededPeriods.length} kỳ báo cáo ban đầu cho chu kỳ.`);

  // 4b. Khởi tạo 7 đơn vị ban đầu qua seedUnits (G9)
  const seededUnitsList = await seedUnits(db);
  console.log(`- Đã thiết lập ${seededUnitsList.length} đơn vị ban đầu (G9).`);

  // 5. Truy vấn số dòng THẬT từ cơ sở dữ liệu để đối chiếu với readWorkbook
  const [dbP] = await conn`SELECT count(*)::int as count FROM risk_profile WHERE cycle_id = ${cycleId}`;
  const [dbC] = await conn`SELECT count(*)::int as count FROM cause c JOIN risk_profile p ON c.profile_id = p.id WHERE p.cycle_id = ${cycleId}`;
  const [dbI] = await conn`SELECT count(*)::int as count FROM impact i JOIN risk_profile p ON i.profile_id = p.id WHERE p.cycle_id = ${cycleId}`;
  const [dbCtrl] = await conn`SELECT count(*)::int as count FROM control k JOIN risk_profile p ON k.profile_id = p.id WHERE p.cycle_id = ${cycleId}`;
  const [dbAct] = await conn`SELECT count(*)::int as count FROM action_plan a JOIN risk_profile p ON a.profile_id = p.id WHERE p.cycle_id = ${cycleId}`;
  const [dbTask] = await conn`SELECT count(*)::int as count FROM action_task t JOIN action_plan a ON t.action_id = a.id JOIN risk_profile p ON a.profile_id = p.id WHERE p.cycle_id = ${cycleId} AND t.deleted_at IS NULL`;
  const [dbKri] = await conn`SELECT count(*)::int as count FROM indicator ind JOIN risk_profile p ON ind.profile_id = p.id WHERE p.cycle_id = ${cycleId} AND ind.kind = 'kri'`;
  const [dbKci] = await conn`SELECT count(*)::int as count FROM indicator ind JOIN risk_profile p ON ind.profile_id = p.id WHERE p.cycle_id = ${cycleId} AND ind.kind = 'kci'`;
  const [dbCc] = await conn`SELECT count(*)::int as count FROM control_cause cc JOIN control k ON cc.control_id = k.id JOIN risk_profile p ON k.profile_id = p.id WHERE p.cycle_id = ${cycleId}`;
  const [dbAc] = await conn`SELECT count(*)::int as count FROM action_control ac JOIN action_plan a ON ac.action_id = a.id JOIN risk_profile p ON a.profile_id = p.id WHERE p.cycle_id = ${cycleId}`;
  const [dbPer] = await conn`SELECT count(*)::int as count FROM period WHERE cycle_id = ${cycleId}`;
  console.log(`- Số kỳ báo cáo trong DB: ${dbPer.count} (kỳ vọng: 4)`);
  if (dbPer.count !== 4) {
    console.error(`❌ LỖI: Số kỳ báo cáo trong DB (${dbPer.count}) không đúng kỳ vọng (4)`);
    process.exit(1);
  }

  const comparisonRows = [
    { 'Đối tượng': 'Hồ sơ rủi ro', 'Cơ sở dữ liệu': dbP.count, 'Workbook': expectedCounts.profiles },
    { 'Đối tượng': 'Nguyên nhân (NN)', 'Cơ sở dữ liệu': dbC.count, 'Workbook': expectedCounts.causes },
    { 'Đối tượng': 'Ảnh hưởng (AH)', 'Cơ sở dữ liệu': dbI.count, 'Workbook': expectedCounts.impacts },
    { 'Đối tượng': 'Kiểm soát (KS)', 'Cơ sở dữ liệu': dbCtrl.count, 'Workbook': expectedCounts.controls },
    { 'Đối tượng': 'Kế hoạch hành động (KH)', 'Cơ sở dữ liệu': dbAct.count, 'Workbook': expectedCounts.actions },
    { 'Đối tượng': 'Đầu việc mặc định (Task)', 'Cơ sở dữ liệu': dbTask.count, 'Workbook': expectedCounts.actionTasks },
    { 'Đối tượng': 'Chỉ số KRI', 'Cơ sở dữ liệu': dbKri.count, 'Workbook': expectedCounts.kri },
    { 'Đối tượng': 'Chỉ số KCI', 'Cơ sở dữ liệu': dbKci.count, 'Workbook': expectedCounts.kci },
    { 'Đối tượng': 'Liên kết Kiểm soát - Nguyên nhân', 'Cơ sở dữ liệu': dbCc.count, 'Workbook': expectedCounts.controlCause },
    { 'Đối tượng': 'Liên kết Kế hoạch - Kiểm soát', 'Cơ sở dữ liệu': dbAc.count, 'Workbook': expectedCounts.actionControl },
  ];

  console.log('\n=== BẢNG ĐỐI CHIẾU CƠ SỞ DỮ LIỆU VỚI WORKBOOK ===');
  console.table(comparisonRows);

  // Kiểm tra khớp nhau
  const mismatches = comparisonRows.filter((r) => r['Cơ sở dữ liệu'] !== r['Workbook']);
  if (mismatches.length > 0) {
    console.error('\n❌ LỖI ĐỐI CHIẾU: Cơ sở dữ liệu không khớp với workbook ở các mục sau:');
    for (const m of mismatches) {
      console.error(`- ${m['Đối tượng']}: DB = ${m['Cơ sở dữ liệu']}, Workbook = ${m['Workbook']}`);
    }
    process.exit(1);
  }

  const linkOneSidedWarnings = report.warnings.filter(
    (w) => w.code === 'LINK_ONE_SIDED' || w.message.includes('LINK_ONE_SIDED')
  );
  if (linkOneSidedWarnings.length > 0) {
    console.log(`\n=== CẢNH BÁO LIÊN KẾT MỘT CHIỀU (LINK_ONE_SIDED: ${linkOneSidedWarnings.length}) ===`);
    for (const w of linkOneSidedWarnings) {
      console.log(`- [${w.profileCode}]: ${w.message}`);
    }
  }

  const otherWarnings = report.warnings.filter(
    (w) => w.code !== 'LINK_ONE_SIDED' && !w.message.includes('LINK_ONE_SIDED')
  );
  if (otherWarnings.length > 0) {
    console.log(`\n=== CÁC CẢNH BÁO KHÁC (${otherWarnings.length}) ===`);
    for (const w of otherWarnings) {
      console.log(`- [${w.profileCode} / ${w.itemCode ?? ''}]: ${w.message}`);
    }
  }

  console.log('\n=== IMPORT CHU KỲ VÀ THIẾT LẬP HOÀN TẤT THÀNH CÔNG ===\n');
}

main()
  .then(async () => {
    await conn.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Lỗi khi thực thi seed:', err);
    await conn.end();
    process.exit(1);
  });
