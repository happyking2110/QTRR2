import type { ParsedProfile } from './read-workbook';
import { levelScore } from '../domain/scales';
import { parseThresholdSet } from '../domain/thresholds';

export type IssueLevel = 'error' | 'warning';

export type ImportIssueCode =
  | 'LINK_ONE_SIDED'
  | 'MANUAL_ZONE'
  | 'NO_DUE_DATE'
  | 'SKIPPED_EDITED'
  | 'SKIPPED_DELETED'
  | 'BAD_REFERENCE'
  | 'DUPLICATE_CODE'
  | 'BAD_PREFIX'
  | 'MISSING_CODE'
  | 'UNKNOWN_SCALE_LABEL'
  | 'UNKNOWN_FREQUENCY'
  | 'EMPTY_SECTION';

export interface ImportIssue {
  level: IssueLevel;
  code: ImportIssueCode;
  message: string;
  ref: string | null;
  profileCode?: string;
  itemCode?: string;
}

function pushIssue(
  issues: ImportIssue[],
  level: IssueLevel,
  code: ImportIssueCode,
  profileCode: string,
  message: string,
  options?: { itemCode?: string; ref?: string | null }
): void {
  const ref = options?.ref !== undefined ? options.ref : (options?.itemCode ?? (profileCode !== '(thiếu mã)' ? profileCode : null));
  issues.push({
    level,
    code,
    message,
    ref,
    profileCode,
    ...(options?.itemCode ? { itemCode: options.itemCode } : {}),
  });
}

function checkScaleLevel(
  issues: ImportIssue[],
  axis: 'impact' | 'likelihood',
  label: string,
  profileCode: string,
  message: string,
  itemCode?: string
): void {
  try {
    levelScore(axis, label);
  } catch {
    pushIssue(
      issues,
      'error',
      'UNKNOWN_SCALE_LABEL',
      profileCode,
      message,
      itemCode ? { itemCode, ref: itemCode } : { ref: profileCode }
    );
  }
}

/**
 * Kiểm tra tính hợp lệ và toàn vẹn tham chiếu của các hồ sơ trước khi import:
 * - Lỗi chặn: thiếu mã, mã trùng, mã con sai tiền tố, nhãn mức lạ, số lượng mục = 0, tham chiếu mồ côi (KS↔NN, KS↔KH).
 * - Cảnh báo: chỉ số chuyển manual, KH không có hạn ngày.
 */
export function validate(profiles: ParsedProfile[]): ImportIssue[] {
  const issues: ImportIssue[] = [];

  for (const profile of profiles) {
    const pCode = profile.riskCode || '(thiếu mã)';

    // 1. Kiểm tra thiếu mã hồ sơ
    if (!profile.riskCode || !profile.hsrrCode) {
      pushIssue(
        issues,
        'error',
        'MISSING_CODE',
        pCode,
        'Thiếu mã rủi ro (riskCode) hoặc mã HSRR (hsrrCode)',
        { ref: profile.riskCode || null }
      );
    }

    // 2. Số lượng các danh mục bằng 0
    if (profile.causes.length === 0) {
      pushIssue(issues, 'error', 'EMPTY_SECTION', pCode, 'Số lượng nguyên nhân bằng 0', { ref: pCode });
    }
    if (profile.impacts.length === 0) {
      pushIssue(issues, 'error', 'EMPTY_SECTION', pCode, 'Số lượng ảnh hưởng bằng 0', { ref: pCode });
    }
    if (profile.controls.length === 0) {
      pushIssue(issues, 'error', 'EMPTY_SECTION', pCode, 'Số lượng kiểm soát bằng 0', { ref: pCode });
    }
    if (profile.actions.length === 0) {
      pushIssue(issues, 'error', 'EMPTY_SECTION', pCode, 'Số lượng kế hoạch hành động bằng 0', { ref: pCode });
    }
    if (profile.indicators.length === 0) {
      pushIssue(issues, 'error', 'EMPTY_SECTION', pCode, 'Số lượng chỉ số bằng 0', { ref: pCode });
    }

    // 3. Nhãn mức rủi ro tiềm ẩn trong thang đo
    checkScaleLevel(
      issues,
      'impact',
      profile.inherent.impact,
      pCode,
      `Nhãn mức ảnh hưởng tiềm ẩn "${profile.inherent.impact}" không có trong thang đo`
    );

    checkScaleLevel(
      issues,
      'likelihood',
      profile.inherent.likelihood,
      pCode,
      `Nhãn khả năng xảy ra tiềm ẩn "${profile.inherent.likelihood}" không có trong thang đo`
    );

    // 4. Nhãn mức độ ảnh hưởng của từng AH
    for (const impact of profile.impacts) {
      checkScaleLevel(
        issues,
        'impact',
        impact.level,
        pCode,
        `Nhãn mức ảnh hưởng "${impact.level}" của ${impact.code} không có trong thang đo`,
        impact.code
      );
    }

    // 5. Kiểm tra mã con phải bắt đầu bằng riskCode
    const checkPrefix = (code: string) => {
      if (!profile.riskCode || !code.startsWith(profile.riskCode)) {
        pushIssue(
          issues,
          'error',
          'BAD_PREFIX',
          pCode,
          `Mã con không bắt đầu bằng mã hồ sơ: ${code}`,
          { itemCode: code, ref: code }
        );
      }
    };

    const seenCodes = new Set<string>();
    const checkDuplicate = (code: string) => {
      if (seenCodes.has(code)) {
        pushIssue(
          issues,
          'error',
          'DUPLICATE_CODE',
          pCode,
          `Mã bị trùng lặp trong cùng hồ sơ: ${code}`,
          { itemCode: code, ref: code }
        );
      } else {
        seenCodes.add(code);
      }
    };

    for (const c of profile.causes) {
      checkPrefix(c.code);
      checkDuplicate(c.code);
    }
    for (const a of profile.impacts) {
      checkPrefix(a.code);
      checkDuplicate(a.code);
    }
    for (const k of profile.controls) {
      checkPrefix(k.code);
      checkDuplicate(k.code);
    }
    for (const act of profile.actions) {
      checkPrefix(act.code);
      checkDuplicate(act.code);
    }
    for (const ind of profile.indicators) {
      checkPrefix(ind.code);
      checkDuplicate(ind.code);
    }

    // 6. Kiểm tra tham chiếu mã trong cùng hồ sơ
    const causeSet = new Set(profile.causes.map((c) => c.code));
    const controlSet = new Set(profile.controls.map((c) => c.code));
    const actionSet = new Set(profile.actions.map((a) => a.code));

    // KS -> NN
    for (const ctrl of profile.controls) {
      for (const causeCode of ctrl.causeCodes) {
        if (!causeSet.has(causeCode)) {
          pushIssue(
            issues,
            'error',
            'BAD_REFERENCE',
            pCode,
            `Kiểm soát ${ctrl.code} tham chiếu đến nguyên nhân không tồn tại: ${causeCode}`,
            { itemCode: ctrl.code, ref: ctrl.code }
          );
        }
      }
    }

    // NN -> KS
    for (const cause of profile.causes) {
      for (const ctrlCode of cause.controlCodes) {
        if (!controlSet.has(ctrlCode)) {
          pushIssue(
            issues,
            'error',
            'BAD_REFERENCE',
            pCode,
            `Nguyên nhân ${cause.code} tham chiếu đến kiểm soát không tồn tại: ${ctrlCode}`,
            { itemCode: cause.code, ref: cause.code }
          );
        }
      }
    }

    // KS -> KH
    for (const ctrl of profile.controls) {
      for (const actCode of ctrl.actionCodes) {
        if (!actionSet.has(actCode)) {
          pushIssue(
            issues,
            'error',
            'BAD_REFERENCE',
            pCode,
            `Kiểm soát ${ctrl.code} tham chiếu đến kế hoạch hành động không tồn tại: ${actCode}`,
            { itemCode: ctrl.code, ref: ctrl.code }
          );
        }
      }
    }

    // KH -> KS
    for (const act of profile.actions) {
      for (const ctrlCode of act.controlCodes) {
        if (!controlSet.has(ctrlCode)) {
          pushIssue(
            issues,
            'error',
            'BAD_REFERENCE',
            pCode,
            `Kế hoạch hành động ${act.code} tham chiếu đến kiểm soát không tồn tại: ${ctrlCode}`,
            { itemCode: act.code, ref: act.code }
          );
        }
      }
    }

    // Kiểm tra tần suất chỉ số
    for (const ind of profile.indicators) {
      const freq = ind.frequency ? ind.frequency.trim() : '';
      if (!['Tháng', 'Quý', 'Hàng quý', 'Theo đợt diễn tập'].includes(freq)) {
        pushIssue(
          issues,
          'error',
          'UNKNOWN_FREQUENCY',
          pCode,
          `Chỉ số ${ind.code} có tần suất không hợp lệ: "${ind.frequency}"`,
          { itemCode: ind.code, ref: ind.code }
        );
      }
    }

    // 7. Cảnh báo (Warning)
    // Cảnh báo chỉ số chuyển sang manual
    for (const ind of profile.indicators) {
      const thSet = parseThresholdSet(ind.thresholds);
      if (thSet.mode === 'manual') {
        pushIssue(
          issues,
          'warning',
          'MANUAL_ZONE',
          pCode,
          `Chỉ số chuyển sang chấm vùng thủ công (${ind.code}): ${thSet.reason}`,
          { itemCode: ind.code, ref: ind.code }
        );
      }
    }

    // Cảnh báo kế hoạch hành động không có ngày hoàn thành
    for (const act of profile.actions) {
      if (act.dueDate === null) {
        pushIssue(
          issues,
          'warning',
          'NO_DUE_DATE',
          pCode,
          `Kế hoạch hành động không có ngày hoàn thành xác định (${act.code}): "${act.dueText}"`,
          { itemCode: act.code, ref: act.code }
        );
      }
    }

    // Cảnh báo liên kết một chiều LINK_ONE_SIDED (KS <-> NN và KH <-> KS)
    const ctrlMap = new Map(profile.controls.map((c) => [c.code, c]));
    const causeMap = new Map(profile.causes.map((c) => [c.code, c]));
    const actionMap = new Map(profile.actions.map((a) => [a.code, a]));

    // 7.1 Kiểm tra liên kết KS <-> NN
    const ctrlCausePairs = new Set<string>();
    for (const ctrl of profile.controls) {
      for (const causeCode of ctrl.causeCodes) {
        if (causeSet.has(causeCode)) {
          ctrlCausePairs.add(`${ctrl.code}|${causeCode}`);
        }
      }
    }
    for (const cause of profile.causes) {
      for (const ctrlCode of cause.controlCodes) {
        if (controlSet.has(ctrlCode)) {
          ctrlCausePairs.add(`${ctrlCode}|${cause.code}`);
        }
      }
    }

    for (const pair of ctrlCausePairs) {
      const [ctrlCode, causeCode] = pair.split('|');
      const inKs = ctrlMap.get(ctrlCode)?.causeCodes.includes(causeCode);
      const inNn = causeMap.get(causeCode)?.controlCodes.includes(ctrlCode);
      if (inKs && !inNn) {
        pushIssue(
          issues,
          'warning',
          'LINK_ONE_SIDED',
          pCode,
          `LINK_ONE_SIDED: Liên kết giữa kiểm soát ${ctrlCode} và nguyên nhân ${causeCode} chỉ được khai báo ở chiều KS -> NN`,
          { itemCode: ctrlCode, ref: ctrlCode }
        );
      } else if (!inKs && inNn) {
        pushIssue(
          issues,
          'warning',
          'LINK_ONE_SIDED',
          pCode,
          `LINK_ONE_SIDED: Liên kết giữa kiểm soát ${ctrlCode} và nguyên nhân ${causeCode} chỉ được khai báo ở chiều NN -> KS`,
          { itemCode: causeCode, ref: causeCode }
        );
      }
    }

    // 7.2 Kiểm tra liên kết KH <-> KS
    const actionControlPairs = new Set<string>();
    for (const act of profile.actions) {
      for (const ctrlCode of act.controlCodes) {
        if (controlSet.has(ctrlCode)) {
          actionControlPairs.add(`${act.code}|${ctrlCode}`);
        }
      }
    }
    for (const ctrl of profile.controls) {
      for (const actCode of ctrl.actionCodes) {
        if (actionSet.has(actCode)) {
          actionControlPairs.add(`${actCode}|${ctrl.code}`);
        }
      }
    }

    for (const pair of actionControlPairs) {
      const [actCode, ctrlCode] = pair.split('|');
      const inKh = actionMap.get(actCode)?.controlCodes.includes(ctrlCode);
      const inKs = ctrlMap.get(ctrlCode)?.actionCodes.includes(actCode);
      if (inKh && !inKs) {
        pushIssue(
          issues,
          'warning',
          'LINK_ONE_SIDED',
          pCode,
          `LINK_ONE_SIDED: Liên kết giữa kế hoạch hành động ${actCode} và kiểm soát ${ctrlCode} chỉ được khai báo ở chiều KH -> KS`,
          { itemCode: actCode, ref: actCode }
        );
      } else if (!inKh && inKs) {
        pushIssue(
          issues,
          'warning',
          'LINK_ONE_SIDED',
          pCode,
          `LINK_ONE_SIDED: Liên kết giữa kế hoạch hành động ${actCode} và kiểm soát ${ctrlCode} chỉ được khai báo ở chiều KS -> KH`,
          { itemCode: ctrlCode, ref: ctrlCode }
        );
      }
    }
  }

  return issues;
}
