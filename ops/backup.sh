#!/bin/sh
set -e

# Kiểm tra các biến môi trường bắt buộc
: "${PGHOST:?thiếu biến PGHOST}"
: "${PGUSER:?thiếu biến PGUSER}"
: "${PGDATABASE:?thiếu biến PGDATABASE}"
: "${PGPASSWORD:?thiếu biến PGPASSWORD}"

BACKUP_DIR="${BACKUP_DIR:-/backups}"
DAILY_DIR="${BACKUP_DIR}/daily"
WEEKLY_DIR="${BACKUP_DIR}/weekly"

mkdir -p "${DAILY_DIR}" "${WEEKLY_DIR}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DATE_DAY=$(date +"%Y%m%d")
DAY_OF_WEEK=$(date +"%u") # 1 (Monday) to 7 (Sunday)

DAILY_FILE="${DAILY_DIR}/hsrr_daily_${TIMESTAMP}.dump"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Bắt đầu sao lưu hằng ngày vào ${DAILY_FILE}..."

# Thực hiện pg_dump định dạng custom (-Fc) bằng role hsrr_owner
pg_dump -h "${PGHOST}" -U "${PGUSER}" -d "${PGDATABASE}" -Fc -f "${DAILY_FILE}"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Sao lưu hoàn thành: ${DAILY_FILE} ($(wc -c < "${DAILY_FILE}") bytes)"

# Bản sao lưu tuần (chạy vào Chủ nhật - DAY_OF_WEEK = 7)
if [ "${DAY_OF_WEEK}" = "7" ] || [ "${FORCE_WEEKLY:-0}" = "1" ]; then
  WEEKLY_FILE="${WEEKLY_DIR}/hsrr_weekly_${DATE_DAY}.dump"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Tạo bản sao lưu tuần: ${WEEKLY_FILE}..."
  cp "${DAILY_FILE}" "${WEEKLY_FILE}"
fi

# Xoay vòng bản sao lưu: Giữ 14 bản hằng ngày gần nhất
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Dọn dẹp bản sao lưu cũ hằng ngày (giữ 14 bản gần nhất)..."
DAILY_COUNT=$(ls -1 "${DAILY_DIR}"/hsrr_daily_*.dump 2>/dev/null | wc -l || echo 0)
if [ "${DAILY_COUNT}" -gt 14 ]; then
  # Liệt kê theo thời gian mới nhất trước, lấy từ dòng 15 trở đi để xóa
  ls -1t "${DAILY_DIR}"/hsrr_daily_*.dump | tail -n +15 | while read -r old_file; do
    echo "Xóa bản sao lưu cũ: ${old_file}"
    rm -f "${old_file}"
  done
fi

# Xoay vòng bản sao lưu tuần: Giữ 12 bản tuần gần nhất
WEEKLY_COUNT=$(ls -1 "${WEEKLY_DIR}"/hsrr_weekly_*.dump 2>/dev/null | wc -l || echo 0)
if [ "${WEEKLY_COUNT}" -gt 12 ]; then
  ls -1t "${WEEKLY_DIR}"/hsrr_weekly_*.dump | tail -n +13 | while read -r old_file; do
    echo "Xóa bản sao lưu tuần cũ: ${old_file}"
    rm -f "${old_file}"
  done
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Hoàn tất sao lưu và xoay vòng bản sao lưu."
