/**
 * Phân tích hạn hoàn thành (due date) từ ô Excel hoặc chuỗi văn bản:
 * - Trả về mốc muộn nhất tìm được (00:00 UTC) và văn bản gốc (dueText)
 * - Hỗ trợ các định dạng ngày: dd/mm/yyyy và Quý I|II|III|IV/yyyy (tính cuối quý)
 */
export function parseDue(raw: Date | string | null | undefined): {
  dueDate: Date | null;
  dueText: string;
} {
  if (raw === null || raw === undefined) {
    return { dueDate: null, dueText: '' };
  }

  if (raw instanceof Date) {
    const y = raw.getUTCFullYear();
    const m = raw.getUTCMonth();
    const d = raw.getUTCDate();
    const formatted = `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y}`;
    return {
      dueDate: new Date(Date.UTC(y, m, d)),
      dueText: formatted,
    };
  }

  const str = String(raw);
  if (!str.trim()) {
    return { dueDate: null, dueText: '' };
  }

  const foundDates: Date[] = [];

  // 1. Tìm các ngày dạng dd/mm/yyyy
  const dateRegex = /(\d{1,2})\/(\d{1,2})\/(\d{4})/g;
  let match: RegExpExecArray | null;
  while ((match = dateRegex.exec(str)) !== null) {
    const d = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const y = parseInt(match[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      foundDates.push(new Date(Date.UTC(y, m - 1, d)));
    }
  }

  // 2. Tìm các quý dạng Quý I|II|III|IV/yyyy
  const quarterRegex = /[Qq]uý\s*(IV|III|II|I)\/(\d{4})/gi;
  while ((match = quarterRegex.exec(str)) !== null) {
    const q = match[1].toUpperCase();
    const y = parseInt(match[2], 10);
    let m = 3;
    let d = 31;
    if (q === 'I') {
      m = 3;
      d = 31;
    } else if (q === 'II') {
      m = 6;
      d = 30;
    } else if (q === 'III') {
      m = 9;
      d = 30;
    } else if (q === 'IV') {
      m = 12;
      d = 31;
    }
    foundDates.push(new Date(Date.UTC(y, m - 1, d)));
  }

  if (foundDates.length === 0) {
    return { dueDate: null, dueText: str };
  }

  // Lấy mốc muộn nhất
  const latestDate = foundDates.reduce((latest, current) =>
    current.getTime() > latest.getTime() ? current : latest
  );

  return {
    dueDate: latestDate,
    dueText: str,
  };
}
