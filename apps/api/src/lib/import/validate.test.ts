import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { readWorkbook, type ParsedProfile } from './read-workbook';
import { validate } from './validate';

describe('validate - kiểm tra file Excel thật', () => {
  const filePath = fs.existsSync(path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx'))
    ? path.resolve(process.cwd(), 'data/RRTY2026.MBF.xlsx')
    : path.resolve(__dirname, '../../../../../data/RRTY2026.MBF.xlsx');
  const buffer = fs.readFileSync(filePath);

  it('file thật cho 0 lỗi chặn, 5 cảnh báo chỉ số thủ công và đúng 7 cảnh báo LINK_ONE_SIDED', async () => {
    const profiles = await readWorkbook(buffer);
    const issues = validate(profiles);

    const errors = issues.filter((i) => i.level === 'error');
    const warnings = issues.filter((i) => i.level === 'warning');

    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(12);

    const manualWarnings = warnings.filter((w) =>
      w.message.includes('thủ công')
    );
    expect(manualWarnings).toHaveLength(5);

    const manualCodes = manualWarnings.map((w) => w.itemCode);
    expect(manualCodes).toContain('CN02.R13.KRI01');
    expect(manualCodes).toContain('CN02.R13.KRI02');
    expect(manualCodes).toContain('CN03.R14.KRI01');
    expect(manualCodes).toContain('TT07.R46.KRI01');
    expect(manualCodes).toContain('TT07.R46.KRI03');

    const linkWarnings = warnings.filter(
      (w) => w.code === 'LINK_ONE_SIDED' || w.message.includes('LINK_ONE_SIDED')
    );
    expect(linkWarnings).toHaveLength(7);
  });
});

describe('validate - kiểm tra các lỗi chặn và cảnh báo bằng dữ liệu giả lập', () => {
  function getSampleProfile(): ParsedProfile {
    return {
      riskCode: 'TEST.R01',
      hsrrCode: 'HSRRTY_MBF_2026_TEST.R01',
      name: 'Rủi ro thử nghiệm',
      riskType: 'Hoạt động',
      riskZone: 'Hạ tầng',
      riskGroup: 'Sự cố',
      owner: 'TGĐ',
      relatedActivity: 'CNTT',
      preparedByUnit: 'Ban 4',
      description: 'Mô tả',
      inherent: {
        impact: 'Nghiêm trọng',
        likelihood: 'Có thể xảy ra',
        level: 'Cao',
      },
      causes: [
        {
          code: 'TEST.R01.NN01',
          group: 'Hệ thống',
          description: 'Nguyên nhân 1',
          controlCodes: ['TEST.R01.KS01'],
        },
      ],
      impacts: [
        {
          code: 'TEST.R01.AH01',
          group: 'Tài chính',
          description: 'Ảnh hưởng 1',
          level: 'Lớn',
        },
      ],
      controls: [
        {
          code: 'TEST.R01.KS01',
          description: 'Kiểm soát 1',
          ownerText: 'TT1',
          frequency: 'Hàng ngày',
          objective: 'Phòng ngừa',
          method: 'Tự động',
          designEff: 'Hiệu quả',
          operatingEff: 'Hiệu quả',
          overallEff: 'Hiệu quả',
          needsSupplement: false,
          actionCodes: ['TEST.R01.KH01'],
          causeCodes: ['TEST.R01.NN01'],
        },
      ],
      actions: [
        {
          code: 'TEST.R01.KH01',
          description: 'Kế hoạch 1',
          responsibilityText: 'Ban 4',
          deliverable: 'Báo cáo',
          dueText: '31/12/2026',
          dueDate: new Date(Date.UTC(2026, 11, 31)),
          controlCodes: ['TEST.R01.KS01'],
        },
      ],
      indicators: [
        {
          code: 'TEST.R01.KRI01',
          kind: 'kri',
          name: 'Chỉ số 1',
          formula: 'Công thức',
          frequency: 'Quý',
          thresholds: ['≤ 5%', '> 5% - 10%', '> 10%'],
          note: null,
        },
      ],
    };
  }

  it('lỗi chặn: thiếu riskCode hoặc hsrrCode', () => {
    const p1 = getSampleProfile();
    p1.riskCode = '';
    const issues = validate([p1]);
    expect(issues.some((i) => i.level === 'error' && i.message.toLowerCase().includes('thiếu mã'))).toBe(true);

    const p2 = getSampleProfile();
    p2.hsrrCode = '';
    const issues2 = validate([p2]);
    expect(issues2.some((i) => i.level === 'error' && i.message.toLowerCase().includes('thiếu mã'))).toBe(true);
  });

  it('lỗi chặn: số lượng nguyên nhân bằng 0', () => {
    const p = getSampleProfile();
    p.causes = [];
    const issues = validate([p]);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('nguyên nhân bằng 0'))).toBe(true);
  });

  it('lỗi chặn: số lượng ảnh hưởng bằng 0', () => {
    const p = getSampleProfile();
    p.impacts = [];
    const issues = validate([p]);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('ảnh hưởng bằng 0'))).toBe(true);
  });

  it('lỗi chặn: số lượng kiểm soát bằng 0', () => {
    const p = getSampleProfile();
    p.controls = [];
    const issues = validate([p]);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('kiểm soát bằng 0'))).toBe(true);
  });

  it('lỗi chặn: số lượng kế hoạch hành động bằng 0', () => {
    const p = getSampleProfile();
    p.actions = [];
    const issues = validate([p]);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('kế hoạch hành động bằng 0'))).toBe(true);
  });

  it('lỗi chặn: số lượng chỉ số bằng 0', () => {
    const p = getSampleProfile();
    p.indicators = [];
    const issues = validate([p]);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('chỉ số bằng 0'))).toBe(true);
  });

  it('lỗi chặn: nhãn mức không hợp lệ', () => {
    const p = getSampleProfile();
    p.inherent.impact = 'Mức độ lạ';
    const issues = validate([p]);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('thang'))).toBe(true);
  });

  it('lỗi chặn: mã con không bắt đầu bằng riskCode', () => {
    const p = getSampleProfile();
    p.causes[0].code = 'OTHER.NN01';
    const issues = validate([p]);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('bắt đầu'))).toBe(true);
  });

  it('lỗi chặn: mã trùng lặp trong cùng hồ sơ', () => {
    const p = getSampleProfile();
    p.causes.push({
      code: 'TEST.R01.NN01',
      group: 'Khác',
      description: 'Trùng mã',
      controlCodes: [],
    });
    const issues = validate([p]);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('trùng'))).toBe(true);
  });

  it('lỗi chặn: tham chiếu KS -> NN không tồn tại', () => {
    const p = getSampleProfile();
    p.controls[0].causeCodes = ['TEST.R01.NN99'];
    const issues = validate([p]);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('TEST.R01.NN99'))).toBe(true);
  });

  it('lỗi chặn: tham chiếu NN -> KS không tồn tại', () => {
    const p = getSampleProfile();
    p.causes[0].controlCodes = ['TEST.R01.KS99'];
    const issues = validate([p]);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('TEST.R01.KS99'))).toBe(true);
  });

  it('lỗi chặn: tham chiếu KS -> KH không tồn tại', () => {
    const p = getSampleProfile();
    p.controls[0].actionCodes = ['TEST.R01.KH99'];
    const issues = validate([p]);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('TEST.R01.KH99'))).toBe(true);
  });

  it('lỗi chặn: tham chiếu KH -> KS không tồn tại', () => {
    const p = getSampleProfile();
    p.actions[0].controlCodes = ['TEST.R01.KS99'];
    const issues = validate([p]);
    expect(issues.some((i) => i.level === 'error' && i.message.includes('TEST.R01.KS99'))).toBe(true);
  });

  it('cảnh báo: kế hoạch hành động không có ngày hoàn thành', () => {
    const p = getSampleProfile();
    p.actions[0].dueDate = null;
    p.actions[0].dueText = 'theo kế hoạch phê duyệt';
    const issues = validate([p]);
    expect(issues.some((i) => i.level === 'warning' && i.message.includes('ngày'))).toBe(true);
  });

  it('cảnh báo: liên kết một chiều LINK_ONE_SIDED khi chỉ một phía khai báo', () => {
    const p = getSampleProfile();
    // Ban đầu sample profile có KS01 <-> NN01 (cả 2 chiều) và KS01 <-> KH01 (cả 2 chiều)
    // Xóa chiều NN01 -> KS01, chỉ giữ KS01 -> NN01
    p.causes[0].controlCodes = [];
    // Xóa chiều KS01 -> KH01, chỉ giữ KH01 -> KS01
    p.controls[0].actionCodes = [];

    const issues = validate([p]);
    const linkWarnings = issues.filter(
      (i) => i.level === 'warning' && (i.code === 'LINK_ONE_SIDED' || i.message.includes('LINK_ONE_SIDED'))
    );
    expect(linkWarnings).toHaveLength(2);

    // Một cảnh báo cho KS01 -> NN01 (thiếu chiều NN -> KS)
    expect(
      linkWarnings.some((w) => w.message.includes('KS -> NN') || w.message.includes('TEST.R01.KS01'))
    ).toBe(true);
    // Một cảnh báo cho KH01 -> KS01 (thiếu chiều KS -> KH)
    expect(
      linkWarnings.some((w) => w.message.includes('KH -> KS') || w.message.includes('TEST.R01.KH01'))
    ).toBe(true);
  });
});

