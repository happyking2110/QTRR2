export interface ReadingWithPeriod {
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  periodStartsOn: Date | string;
  periodEndsOn: Date | string;
  reviewedAt: Date | string | null;
  [key: string]: any;
}

/**
 * Xác định giá trị hiện hành (current reading) của một chỉ số:
 * - Chỉ lấy bản ghi có status = 'approved'
 * - Lọc bỏ kỳ có periodEndsOn > asOfEndsOn (nếu asOfEndsOn được truyền)
 * - Chọn kỳ có periodEndsOn lớn nhất (ví dụ: 2026-Q4 kết thúc 31/12 thắng 2026-10 kết thúc 31/10)
 * - Hai kỳ cùng ngày kết thúc (ví dụ: 2026-12 và 2026-Q4 kết thúc 31/12) thì kỳ ngắn hơn (bắt đầu muộn hơn) thắng
 * - Trong cùng kỳ, chọn bản ghi có reviewedAt mới nhất
 * - Không có bản nào hợp lệ -> trả về null
 */
export function currentReading<T extends ReadingWithPeriod>(
  readings: T[],
  asOfEndsOn?: Date | string | null
): T | null {
  const asOfTime = asOfEndsOn ? new Date(asOfEndsOn).getTime() : null;

  const validReadings = readings.filter((r) => {
    if (r.status !== 'approved') return false;
    if (asOfTime !== null) {
      const endsOnTime = new Date(r.periodEndsOn).getTime();
      if (endsOnTime > asOfTime) return false;
    }
    return true;
  });

  if (validReadings.length === 0) {
    return null;
  }

  validReadings.sort((a, b) => {
    // 1. Sắp xếp theo periodEndsOn giảm dần (kết thúc muộn hơn đứng trước)
    const endsA = new Date(a.periodEndsOn).getTime();
    const endsB = new Date(b.periodEndsOn).getTime();
    if (endsA !== endsB) {
      return endsB - endsA;
    }

    // 2. Cùng periodEndsOn: kỳ ngắn hơn (bắt đầu muộn hơn -> startsOn lớn hơn) đứng trước
    const startsA = new Date(a.periodStartsOn).getTime();
    const startsB = new Date(b.periodStartsOn).getTime();
    if (startsA !== startsB) {
      return startsB - startsA;
    }

    // 3. Cùng kỳ: reviewedAt mới nhất đứng trước
    const reviewedA = a.reviewedAt ? new Date(a.reviewedAt).getTime() : 0;
    const reviewedB = b.reviewedAt ? new Date(b.reviewedAt).getTime() : 0;
    return reviewedB - reviewedA;
  });

  return validReadings[0];
}
