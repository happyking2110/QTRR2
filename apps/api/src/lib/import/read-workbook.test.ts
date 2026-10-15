import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { readWorkbook } from './read-workbook';

describe('readWorkbook - đọc data/RRTY2026.MBF.xlsx thật', () => {
  const filePath = fs.existsSync(path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx'))
    ? path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx')
    : path.resolve(__dirname, '../../../../../data/RRTY2026.MBF.xlsx');
  const buffer = fs.readFileSync(filePath);

  it('đọc thành công 4 hồ sơ với riskCode và hsrrCode tương ứng', async () => {
    const profiles = await readWorkbook(buffer);
    expect(profiles).toHaveLength(4);

    const codes = profiles.map((p) => p.riskCode);
    expect(codes).toEqual(['HD11.R27', 'CN02.R13', 'CN03.R14', 'TT07.R46']);

    for (const p of profiles) {
      expect(p.hsrrCode).toBe(`HSRRTY_MBF_2026_${p.riskCode}`);
      expect(p.name).toBeTruthy();
      expect(p.description).toBeTruthy();
    }
  });

  it('số lượng mỗi hồ sơ đúng bảng mục 6 và tổng cộng 16 NN, 15 AH, 17 KS, 10 KH, 9 KRI, 12 KCI', async () => {
    const profiles = await readWorkbook(buffer);
    const p27 = profiles.find((p) => p.riskCode === 'HD11.R27')!;
    const p13 = profiles.find((p) => p.riskCode === 'CN02.R13')!;
    const p14 = profiles.find((p) => p.riskCode === 'CN03.R14')!;
    const p46 = profiles.find((p) => p.riskCode === 'TT07.R46')!;

    // HD11.R27
    expect(p27.causes).toHaveLength(5);
    expect(p27.impacts).toHaveLength(4);
    expect(p27.controls).toHaveLength(5);
    expect(p27.actions).toHaveLength(3);
    expect(p27.indicators.filter((i) => i.kind === 'kri')).toHaveLength(3);
    expect(p27.indicators.filter((i) => i.kind === 'kci')).toHaveLength(3);

    // CN02.R13
    expect(p13.causes).toHaveLength(4);
    expect(p13.impacts).toHaveLength(4);
    expect(p13.controls).toHaveLength(4);
    expect(p13.actions).toHaveLength(2);
    expect(p13.indicators.filter((i) => i.kind === 'kri')).toHaveLength(2);
    expect(p13.indicators.filter((i) => i.kind === 'kci')).toHaveLength(4);

    // CN03.R14
    expect(p14.causes).toHaveLength(3);
    expect(p14.impacts).toHaveLength(3);
    expect(p14.controls).toHaveLength(4);
    expect(p14.actions).toHaveLength(2);
    expect(p14.indicators.filter((i) => i.kind === 'kri')).toHaveLength(1);
    expect(p14.indicators.filter((i) => i.kind === 'kci')).toHaveLength(2);

    // TT07.R46
    expect(p46.causes).toHaveLength(4);
    expect(p46.impacts).toHaveLength(4);
    expect(p46.controls).toHaveLength(4);
    expect(p46.actions).toHaveLength(3);
    expect(p46.indicators.filter((i) => i.kind === 'kri')).toHaveLength(3);
    expect(p46.indicators.filter((i) => i.kind === 'kci')).toHaveLength(3);

    // Tổng cộng
    const totalNN = profiles.reduce((sum, p) => sum + p.causes.length, 0);
    const totalAH = profiles.reduce((sum, p) => sum + p.impacts.length, 0);
    const totalKS = profiles.reduce((sum, p) => sum + p.controls.length, 0);
    const totalKH = profiles.reduce((sum, p) => sum + p.actions.length, 0);
    const totalKRI = profiles.reduce(
      (sum, p) => sum + p.indicators.filter((i) => i.kind === 'kri').length,
      0
    );
    const totalKCI = profiles.reduce(
      (sum, p) => sum + p.indicators.filter((i) => i.kind === 'kci').length,
      0
    );

    expect(totalNN).toBe(16);
    expect(totalAH).toBe(15);
    expect(totalKS).toBe(17);
    expect(totalKH).toBe(10);
    expect(totalKRI).toBe(9);
    expect(totalKCI).toBe(12);
  });

  it('mức tiềm ẩn đúng bảng mục 6', async () => {
    const profiles = await readWorkbook(buffer);
    const p27 = profiles.find((p) => p.riskCode === 'HD11.R27')!;
    const p13 = profiles.find((p) => p.riskCode === 'CN02.R13')!;
    const p14 = profiles.find((p) => p.riskCode === 'CN03.R14')!;
    const p46 = profiles.find((p) => p.riskCode === 'TT07.R46')!;

    expect(p27.inherent).toEqual({
      impact: 'Nghiêm trọng',
      likelihood: 'Nhiều khả năng xảy ra',
      level: 'Cao',
    });
    expect(p13.inherent).toEqual({
      impact: 'Nghiêm trọng',
      likelihood: 'Nhiều khả năng xảy ra',
      level: 'Cao',
    });
    expect(p14.inherent).toEqual({
      impact: 'Nghiêm trọng',
      likelihood: 'Có thể xảy ra',
      level: 'Cao',
    });
    expect(p46.inherent).toEqual({
      impact: 'Nghiêm trọng',
      likelihood: 'Có thể xảy ra',
      level: 'Cao',
    });
  });

  it('mọi mã con bắt đầu bằng riskCode của hồ sơ', async () => {
    const profiles = await readWorkbook(buffer);

    for (const p of profiles) {
      for (const c of p.causes) {
        expect(c.code.startsWith(p.riskCode)).toBe(true);
      }
      for (const imp of p.impacts) {
        expect(imp.code.startsWith(p.riskCode)).toBe(true);
      }
      for (const ctrl of p.controls) {
        expect(ctrl.code.startsWith(p.riskCode)).toBe(true);
      }
      for (const act of p.actions) {
        expect(act.code.startsWith(p.riskCode)).toBe(true);
      }
      for (const ind of p.indicators) {
        expect(ind.code.startsWith(p.riskCode)).toBe(true);
      }
    }
  });

  it('không có chuỗi nào chứa giá trị lặp do ô gộp (kiểm tra tên và mô tả của cả 4 hồ sơ)', async () => {
    const profiles = await readWorkbook(buffer);

    for (const p of profiles) {
      expect(p.name).toBeTruthy();
      expect(p.description).toBeTruthy();
      // Tên và mô tả không được phép chứa giá trị lặp lại dạng "Tên...Tên..."
      const nameParts = p.name.split('\n');
      expect(new Set(nameParts).size).toBe(nameParts.length);
    }

    const p27 = profiles.find((p) => p.riskCode === 'HD11.R27')!;
    expect(p27.name).toBe('Rủi ro gián đoạn và suy giảm chất lượng dịch vụ mạng');
  });

  it('controls có đúng 9 mục needsSupplement = true', async () => {
    const profiles = await readWorkbook(buffer);
    const p27 = profiles.find((p) => p.riskCode === 'HD11.R27')!;
    const p13 = profiles.find((p) => p.riskCode === 'CN02.R13')!;
    const p14 = profiles.find((p) => p.riskCode === 'CN03.R14')!;
    const p46 = profiles.find((p) => p.riskCode === 'TT07.R46')!;

    expect(p27.controls.filter((c) => c.needsSupplement)).toHaveLength(2);
    expect(p13.controls.filter((c) => c.needsSupplement)).toHaveLength(2);
    expect(p14.controls.filter((c) => c.needsSupplement)).toHaveLength(2);
    expect(p46.controls.filter((c) => c.needsSupplement)).toHaveLength(3);

    const totalSupp = profiles.reduce(
      (sum, p) => sum + p.controls.filter((c) => c.needsSupplement).length,
      0
    );
    expect(totalSupp).toBe(9);
  });

  it('mã tham chiếu của kiểm soát CN03.R14 đã chuẩn hóa không còn tiền tố MBF_, của TT07.R46 không còn dấu cách', async () => {
    const profiles = await readWorkbook(buffer);
    const p14 = profiles.find((p) => p.riskCode === 'CN03.R14')!;
    const p46 = profiles.find((p) => p.riskCode === 'TT07.R46')!;

    for (const c of p14.controls) {
      for (const act of c.actionCodes) {
        expect(act.startsWith('MBF_')).toBe(false);
      }
    }

    for (const c of p46.controls) {
      for (const act of c.actionCodes) {
        expect(act).not.toMatch(/\s/);
      }
      for (const cause of c.causeCodes) {
        expect(cause).not.toMatch(/\s/);
      }
    }
  });

  it('cả 10 KH có description không rỗng và khác code; HD11.R27.KH01 bắt đầu bằng "Tối ưu năng lực"', async () => {
    const profiles = await readWorkbook(buffer);
    const allActions = profiles.flatMap((p) => p.actions);
    expect(allActions).toHaveLength(10);

    for (const act of allActions) {
      expect(act.description).toBeTruthy();
      expect(act.description).not.toBe(act.code);
    }

    const kh01 = allActions.find((a) => a.code === 'HD11.R27.KH01');
    expect(kh01).toBeDefined();
    expect(kh01!.description.startsWith('Tối ưu năng lực')).toBe(true);
  });

  it('test hồi quy: với mọi loại bản ghi có mô tả (profile, cause, impact, control, action), description phải khác code', async () => {
    const profiles = await readWorkbook(buffer);
    for (const p of profiles) {
      expect(p.description).not.toBe(p.riskCode);
      for (const c of p.causes) {
        expect(c.description).not.toBe(c.code);
      }
      for (const imp of p.impacts) {
        expect(imp.description).not.toBe(imp.code);
      }
      for (const ctrl of p.controls) {
        expect(ctrl.description).not.toBe(ctrl.code);
      }
      for (const act of p.actions) {
        expect(act.description).not.toBe(act.code);
      }
    }
  });
});


describe('readWorkbook - kiểm thử workbook giả lập bằng ExcelJS (F2)', () => {
  it('đọc chính xác khi mọi cột bị dịch sang phải 1 cột (cột neo ở cột D)', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('BM06_SHIFTED');

    // Dịch toàn bộ sang phải 1 cột: cột B chứa nhãn, cột D (cột 4) chứa mã
    ws.getCell('B8').value = 'Mã rủi ro';
    ws.getCell('D8').value = 'TEST.R01';
    ws.getCell('B7').value = 'Mã HSRR';
    ws.getCell('D7').value = 'HSRRTY_MBF_2026_TEST.R01';
    ws.getCell('B15').value = 'Tên rủi ro';
    ws.getCell('D15').value = 'Rủi ro dịch cột';
    ws.getCell('B16').value = 'Mô tả rủi ro';
    ws.getCell('D16').value = 'Mô tả dịch cột';

    // Inherent
    ws.getCell('L20').value = 'Mức độ ảnh hưởng';
    ws.getCell('N20').value = 'Khả năng xảy ra';
    ws.getCell('P20').value = 'Mức độ rủi ro';
    ws.getCell('L21').value = 'Nghiêm trọng';
    ws.getCell('N21').value = 'Nhiều khả năng xảy ra';
    ws.getCell('P21').value = 'Cao';

    // 1. Nguyên nhân
    ws.getCell('D25').value = 'Mã nguyên nhân';
    ws.getCell('F25').value = 'Nhóm nguyên nhân';
    ws.getCell('G25').value = 'Mô tả nguyên nhân';
    ws.getCell('P25').value = 'Mã kiểm soát hiện tại';
    ws.getCell('D26').value = 'TEST.R01.NN01';
    ws.getCell('F26').value = 'Hệ thống';
    ws.getCell('G26').value = 'Mô tả NN1';
    ws.getCell('P26').value = 'TEST.R01.KS01';

    // 2. Ảnh hưởng
    ws.getCell('D30').value = 'Mã ảnh hưởng';
    ws.getCell('F30').value = 'Nhóm ảnh hưởng';
    ws.getCell('H30').value = 'Mô tả ảnh hưởng';
    ws.getCell('O30').value = 'Mức độ ảnh hưởng';
    ws.getCell('D31').value = 'TEST.R01.AH01';
    ws.getCell('F31').value = 'Tài chính';
    ws.getCell('H31').value = 'Mô tả AH1';
    ws.getCell('O31').value = 'Nghiêm trọng';

    // 3. Kiểm soát
    ws.getCell('D35').value = 'Mã kiểm soát';
    ws.getCell('F35').value = 'Mô tả kiểm soát';
    ws.getCell('H35').value = 'Chủ kiểm soát';
    ws.getCell('I35').value = 'Tần suất kiểm soát';
    ws.getCell('J35').value = 'Mục tiêu kiểm soát';
    ws.getCell('K35').value = 'Cách thức kiểm soát';
    ws.getCell('L35').value = 'Hiệu quả thiết kế kiểm soát';
    ws.getCell('M35').value = 'Hiệu quả vận hành kiểm soát';
    ws.getCell('N35').value = 'Hiệu quả tổng thể kiểm soát';
    ws.getCell('O35').value = 'Bổ sung kiểm soát';
    ws.getCell('P35').value = 'Mã kế hoạch hành động';
    ws.getCell('Q35').value = 'Tham chiếu đến Nguyên nhân';
    ws.getCell('D36').value = 'TEST.R01.KS01';
    ws.getCell('F36').value = 'Mô tả KS1';
    ws.getCell('H36').value = 'Chủ KS1';
    ws.getCell('I36').value = 'Hằng năm';
    ws.getCell('J36').value = 'Phòng ngừa';
    ws.getCell('K36').value = 'Thủ công';
    ws.getCell('L36').value = 'Tốt';
    ws.getCell('M36').value = 'Tốt';
    ws.getCell('N36').value = 'Tốt';
    ws.getCell('O36').value = 'Có';
    ws.getCell('P36').value = 'TEST.R01.KH01';
    ws.getCell('Q36').value = 'TEST.R01.NN01';

    // 4. Kế hoạch hành động
    ws.getCell('D40').value = 'Mã Kế hoạch hành động';
    ws.getCell('F40').value = 'Phương án xử lý/Kế hoạch hành động';
    ws.getCell('L40').value = 'Trách nhiệm';
    ws.getCell('M40').value = 'Đầu ra yêu cầu';
    ws.getCell('O40').value = 'Ngày hoàn thành dự kiến';
    ws.getCell('Q40').value = 'Tham chiếu đến Kiểm soát hiện tại';
    ws.getCell('D41').value = 'TEST.R01.KH01';
    ws.getCell('F41').value = 'Mô tả KH1';
    ws.getCell('L41').value = 'Ban 4';
    ws.getCell('M41').value = 'Báo cáo';
    ws.getCell('O41').value = '31/12/2026';
    ws.getCell('Q41').value = 'TEST.R01.KS01';

    // 5. KRI
    ws.getCell('D45').value = 'Mã KRI';
    ws.getCell('F45').value = 'Tên chỉ số KRI';
    ws.getCell('I45').value = 'Cách tính KRI';
    ws.getCell('M45').value = 'Tần suất đo lường';
    ws.getCell('O45').value = 'Ngưỡng KRI';
    ws.getCell('D46').value = 'TEST.R01.KRI01';
    ws.getCell('F46').value = 'Chỉ số KRI 1';
    ws.getCell('I46').value = 'Công thức 1';
    ws.getCell('M46').value = 'Quý';
    ws.getCell('O46').value = '≤ 5%';
    ws.getCell('P46').value = '> 5% - 10%';
    ws.getCell('Q46').value = '> 10%';

    // 6. KCI
    ws.getCell('D50').value = 'Mã KCI';
    ws.getCell('F50').value = 'Tên chỉ số KCI';
    ws.getCell('I50').value = 'Cách tính KCI';
    ws.getCell('M50').value = 'Tần suất đo lường';
    ws.getCell('O50').value = 'Ngưỡng KCI';
    ws.getCell('D51').value = 'TEST.R01.KCI01';
    ws.getCell('F51').value = 'Chỉ số KCI 1';
    ws.getCell('I51').value = 'Công thức KCI 1';
    ws.getCell('M51').value = 'Quý';
    ws.getCell('O51').value = '≥ 90%';
    ws.getCell('P51').value = '80% - <90%';
    ws.getCell('Q51').value = '< 80%';

    const uint8 = await wb.xlsx.writeBuffer();
    const shiftedBuffer = Buffer.from(uint8);

    const profiles = await readWorkbook(shiftedBuffer);
    expect(profiles).toHaveLength(1);
    const p = profiles[0];
    expect(p.riskCode).toBe('TEST.R01');
    expect(p.causes).toHaveLength(1);
    expect(p.causes[0].code).toBe('TEST.R01.NN01');
    expect(p.impacts).toHaveLength(1);
    expect(p.impacts[0].code).toBe('TEST.R01.AH01');
    expect(p.controls).toHaveLength(1);
    expect(p.controls[0].code).toBe('TEST.R01.KS01');
    expect(p.controls[0].needsSupplement).toBe(true);
    expect(p.actions).toHaveLength(1);
    expect(p.actions[0].code).toBe('TEST.R01.KH01');
    expect(p.indicators).toHaveLength(2);
  });

  it('báo lỗi IMPORT_INVALID khi sheet thiếu tiêu đề bắt buộc', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('BM06_MISSING');

    // Có tiêu đề Mã nguyên nhân nhưng thiếu Mã kiểm soát
    ws.getCell('C8').value = 'Mã rủi ro';
    ws.getCell('D8').value = 'TEST.R02';
    ws.getCell('C25').value = 'Mã nguyên nhân';
    ws.getCell('E25').value = 'Nhóm nguyên nhân';
    ws.getCell('F25').value = 'Mô tả nguyên nhân';
    ws.getCell('O25').value = 'Mã kiểm soát hiện tại';

    const uint8 = await wb.xlsx.writeBuffer();
    const missingBuffer = Buffer.from(uint8);

    await expect(readWorkbook(missingBuffer)).rejects.toThrow('IMPORT_INVALID');
  });
});


