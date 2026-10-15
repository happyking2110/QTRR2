export type ScaleAxis = 'impact' | 'likelihood';
export type ScaleScore = 1 | 2 | 3 | 4 | 5;

export const SCALE_IS_PROVISIONAL = true;

export const IMPACT_LEVELS = [
  { score: 1 as ScaleScore, label: 'Không đáng kể' },
  { score: 2 as ScaleScore, label: 'Nhỏ' },
  { score: 3 as ScaleScore, label: 'Trung bình' },
  { score: 4 as ScaleScore, label: 'Lớn' },
  { score: 5 as ScaleScore, label: 'Nghiêm trọng' },
] as const;

export const LIKELIHOOD_LEVELS = [
  { score: 1 as ScaleScore, label: 'Hiếm khi' },
  { score: 2 as ScaleScore, label: 'Ít khả năng' },
  { score: 3 as ScaleScore, label: 'Có thể xảy ra' },
  { score: 4 as ScaleScore, label: 'Nhiều khả năng xảy ra' },
  { score: 5 as ScaleScore, label: 'Gần như chắc chắn' },
] as const;

const IMPACT_SCALE = new Map<string, ScaleScore>([
  ['Không đáng kể', 1],
  ['Nhỏ', 2],
  ['Trung bình', 3],
  ['Lớn', 4],
  ['Nghiêm trọng', 5],
]);

const LIKELIHOOD_SCALE = new Map<string, ScaleScore>([
  ['Hiếm khi', 1],
  ['Ít khả năng', 2],
  ['Có thể xảy ra', 3],
  ['Nhiều khả năng xảy ra', 4],
  ['Gần như chắc chắn', 5],
]);

/**
 * Trả về điểm từ 1 đến 5 theo thang đo tạm (giả định G1) cho nhãn mức độ ảnh hưởng hoặc khả năng xảy ra.
 * Ném lỗi rõ ràng kèm tên nhãn và trục nếu gặp nhãn lạ.
 */
export function levelScore(axis: ScaleAxis, label: string): ScaleScore {
  const trimmed = label.trim();

  if (axis === 'impact') {
    const score = IMPACT_SCALE.get(trimmed);
    if (score !== undefined) {
      return score;
    }
  } else if (axis === 'likelihood') {
    const score = LIKELIHOOD_SCALE.get(trimmed);
    if (score !== undefined) {
      return score;
    }
  }

  throw new Error(`Unknown label "${label}" for axis "${axis}"`);
}

/**
 * Tính tọa độ ô trên ma trận nhiệt 5×5 từ nhãn ảnh hưởng và khả năng xảy ra.
 */
export function heatmapCell(
  impactLabel: string,
  likelihoodLabel: string
): { impact: ScaleScore; likelihood: ScaleScore } {
  return {
    impact: levelScore('impact', impactLabel),
    likelihood: levelScore('likelihood', likelihoodLabel),
  };
}
