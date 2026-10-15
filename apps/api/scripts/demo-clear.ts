import { conn } from '../src/server/db/client';
import { clearDemoData } from '../src/server/services/demo';

async function main() {
  console.log('=== BẮT ĐẦU DỌN DẸP DỮ LIỆU DEMO (KẾ HOẠCH 2.3) ===');

  const result = await clearDemoData();

  console.log('✅ ĐÃ DỌN DẸP DỮ LIỆU DEMO THÀNH CÔNG:');
  console.log(`- Số kỳ báo cáo demo đã xóa: ${result.deleted.periods}`);
  console.log(`- Số bản ghi indicator_reading đã xóa: ${result.deleted.indicatorReadings}`);
  console.log(`- Số bản ghi action_update đã xóa: ${result.deleted.actionUpdates}`);
  console.log(`- Số bản ghi residual_assessment đã xóa: ${result.deleted.residualAssessments}`);
}

main()
  .then(async () => {
    await conn.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('❌ Lỗi khi dọn dẹp dữ liệu demo:', err.message || err);
    await conn.end();
    process.exit(1);
  });
