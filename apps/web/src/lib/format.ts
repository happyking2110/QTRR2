/**
 * Hàm định dạng thống nhất cho ứng dụng web MBF Risk Monitor.
 * Quy tắc:
 * - Ngày YYYY-MM-DD -> dd/mm/yyyy: cắt chuỗi, không đổi múi giờ.
 * - Thời điểm ISO -> ngày giờ theo Asia/Ho_Chi_Minh.
 * - Số: vi-VN (dấu phẩy thập phân).
 */

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const clean = dateStr.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return '—';
  const [y, m, d] = parts;
  if (!y || !m || !d) return '—';
  return `${d}/${m}/${y}`;
}

export function formatDateTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour12: false,
    }).format(d);
  } catch {
    return '—';
  }
}

export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '—';
  return new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatPercent(num: number | null | undefined): string {
  if (num === null || num === undefined) return '—';
  return `${formatNumber(num)}%`;
}
