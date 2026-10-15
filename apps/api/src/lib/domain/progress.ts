export interface TaskProgressInput {
  progress: number;
  weight?: number;
}

export interface TaskUpdateInput {
  progress: number;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  reviewedAt: Date | string | null;
  periodEndsOn: Date | string;
}

/**
 * Tính tiến độ hiện hành của đầu việc tới kỳ được chọn (as-of)
 * - Chỉ nhận bản status = 'approved'
 * - Lọc bỏ các bản có periodEndsOn > asOfEndsOn (nếu asOfEndsOn được truyền)
 * - Trong các bản hợp lệ, chọn bản có reviewedAt mới nhất
 * - Nếu không có bản nào hợp lệ, trả về 0
 */
export function progressAsOf(
  updates: TaskUpdateInput[],
  asOfEndsOn?: Date | string | null
): number {
  const asOfTime = asOfEndsOn ? new Date(asOfEndsOn).getTime() : null;

  const validUpdates = updates.filter((u) => {
    if (u.status !== 'approved') return false;
    if (asOfTime !== null) {
      const endsOnTime = new Date(u.periodEndsOn).getTime();
      if (endsOnTime > asOfTime) return false;
    }
    return true;
  });

  if (validUpdates.length === 0) return 0;

  validUpdates.sort((a, b) => {
    const timeA = a.reviewedAt ? new Date(a.reviewedAt).getTime() : 0;
    const timeB = b.reviewedAt ? new Date(b.reviewedAt).getTime() : 0;
    return timeB - timeA;
  });

  return validUpdates[0].progress;
}

/**
 * Tính tiến độ tổng thể của kế hoạch hành động theo trung bình có trọng số của các đầu việc
 * - Trọng số mặc định là 1 nếu không truyền hoặc <= 0
 * - Làm tròn 1 chữ số thập phân
 * - Mảng rỗng trả về 0
 */
export function actionProgress(tasks: TaskProgressInput[]): number {
  if (tasks.length === 0) return 0;

  let totalWeight = 0;
  let weightedProgressSum = 0;

  for (const t of tasks) {
    const w = t.weight !== undefined && t.weight > 0 ? t.weight : 1;
    totalWeight += w;
    weightedProgressSum += t.progress * w;
  }

  if (totalWeight === 0) return 0;
  const avg = weightedProgressSum / totalWeight;
  return Math.round(avg * 10) / 10;
}
