#!/bin/sh
set -e

# Kiểm tra các biến môi trường bắt buộc
: "${PGHOST:?thiếu biến PGHOST}"
: "${PGUSER:?thiếu biến PGUSER}"
: "${PGDATABASE:?thiếu biến PGDATABASE}"
: "${PGPASSWORD:?thiếu biến PGPASSWORD}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Bắt đầu dọn dẹp các phiên đăng nhập hết hạn..."

# Xóa các phiên có expires_at < thời điểm hiện tại
# Tuyệt đối KHÔNG xóa bảng audit_log theo chính sách lưu tối thiểu 3 năm
DELETED=$(psql -h "${PGHOST}" -U "${PGUSER}" -d "${PGDATABASE}" -t -c "
  WITH deleted AS (
    DELETE FROM session WHERE expires_at < NOW() RETURNING id
  )
  SELECT count(*) FROM deleted;
" | tr -d '[:space:]')

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Đã xóa ${DELETED:-0} phiên hết hạn."
