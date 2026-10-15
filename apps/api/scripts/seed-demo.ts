import { conn } from '../src/server/db/client';
import { seedDemoData } from '../src/server/services/demo';

async function main() {
  console.log('=== BẮT ĐẦU TẠO DỮ LIỆU DEMO (KẾ HOẠCH 2.3) ===');

  if (process.env.ALLOW_DEMO_DATA !== '1') {
    console.error('❌ LỖI: Biến môi trường ALLOW_DEMO_DATA phải bằng 1 để chạy script này.');
    process.exit(1);
  }

  const result = await seedDemoData();

  console.log('✅ ĐÃ TẠO DỮ LIỆU DEMO THÀNH CÔNG:');
  console.log(`- Kỳ báo cáo tạo thêm: ${result.inserted.periods}`);
  console.log(`- Số bản ghi indicator_reading: ${result.inserted.indicatorReadings}`);
  console.log(`- Số bản ghi action_update: ${result.inserted.actionUpdates}`);
  console.log(`- Số bản ghi residual_assessment: ${result.inserted.residualAssessments}`);
}

main()
  .then(async () => {
    await conn.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('❌ Lỗi khi tạo dữ liệu demo:', err.message || err);
    await conn.end();
    process.exit(1);
  });
