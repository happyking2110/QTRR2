#!/bin/sh
set -e

echo "[backup] Scheduler sao lưu và bảo trì khởi động thành công."
echo "[backup] Lịch chạy: Sao lưu lúc 02:00, dọn phiên hết hạn lúc 02:30 hàng ngày."

LAST_BACKUP_DAY=""
LAST_PRUNE_DAY=""

# Vòng lặp kiểm tra thời gian định kỳ mỗi 30 giây
while true; do
  TODAY=$(date +"%Y-%m-%d")
  HOUR=$(date +"%H")
  MINUTE=$(date +"%M")

  # Tác vụ sao lưu hằng ngày lúc 02:00
  if [ "${HOUR}" = "02" ] && [ "${LAST_BACKUP_DAY}" != "${TODAY}" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [backup] Kích hoạt tiến trình sao lưu định kỳ..."
    /usr/local/bin/backup.sh || echo "[$(date '+%Y-%m-%d %H:%M:%S')] [backup] CẢNH BÁO: Lỗi khi thực hiện sao lưu!"
    LAST_BACKUP_DAY="${TODAY}"
  fi

  # Tác vụ dọn dẹp phiên hết hạn lúc 02:30
  if [ "${HOUR}" = "02" ] && [ "${MINUTE}" -ge "30" ] && [ "${LAST_PRUNE_DAY}" != "${TODAY}" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [backup] Kích hoạt tiến trình dọn phiên hết hạn..."
    /usr/local/bin/prune-sessions.sh || echo "[$(date '+%Y-%m-%d %H:%M:%S')] [backup] CẢNH BÁO: Lỗi khi dọn phiên!"
    LAST_PRUNE_DAY="${TODAY}"
  fi

  sleep 30
done
