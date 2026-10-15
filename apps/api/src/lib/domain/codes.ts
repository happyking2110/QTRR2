/**
 * Chuẩn hóa mã nhận diện:
 * - Bỏ mọi khoảng trắng
 * - Bỏ tiền tố "MBF_" nếu nó nằm ở đầu chuỗi
 */
export function normalizeCode(raw: string): string {
  const noWhitespace = raw.replace(/\s+/g, '');
  if (noWhitespace.startsWith('MBF_')) {
    return noWhitespace.slice(4);
  }
  return noWhitespace;
}

/**
 * Tách chuỗi chứa một hoặc nhiều mã:
 * - Tách theo dấu xuống dòng (\r, \n), dấu phẩy (,), dấu chấm phẩy (;)
 * - Chuẩn hóa từng mã bằng normalizeCode
 * - Bỏ qua các chuỗi rỗng và ký tự "-"
 */
export function splitCodes(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }

  const parts = raw.split(/[\r\n,;]+/);
  const result: string[] = [];

  for (const part of parts) {
    const normalized = normalizeCode(part);
    if (normalized && normalized !== '-') {
      result.push(normalized);
    }
  }

  return result;
}
