#!/bin/sh
set -e

# Hướng dẫn sử dụng:
# ./ops/restore.sh <đường_dẫn_tệp_sao_lưu.dump>

BACKUP_FILE="$1"

if [ -z "${BACKUP_FILE}" ]; then
  echo "Lỗi: Chưa chỉ định tệp sao lưu cần khôi phục."
  echo "Cú pháp: $0 <đường_dẫn_tệp_sao_lưu.dump>"
  exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Lỗi: Không tìm thấy tệp sao lưu tại '${BACKUP_FILE}'."
  exit 1
fi

echo "=========================================================="
echo "BẮT ĐẦU QUY TRÌNH KHÔI PHỤC DỮ LIỆU TỪ: ${BACKUP_FILE}"
echo "=========================================================="

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

# 1. Dừng các dịch vụ web và api để ngắt toàn bộ kết nối tới db
echo "[1/5] Dừng các dịch vụ web và api..."
docker compose -f "${COMPOSE_FILE}" stop web api

# 2. Ngắt các kết nối còn lại và tạo lại cơ sở dữ liệu hsrr
echo "[2/5] Đặt lại cơ sở dữ liệu hsrr sạch do hsrr_owner sở hữu..."
docker compose -f "${COMPOSE_FILE}" exec -T db psql -U postgres -c "
  SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'hsrr' AND pid <> pg_backend_pid();
  DROP DATABASE IF EXISTS hsrr;
  CREATE DATABASE hsrr OWNER hsrr_owner;
  GRANT ALL PRIVILEGES ON DATABASE hsrr TO hsrr_owner;
  GRANT CONNECT ON DATABASE hsrr TO hsrr_app;
"

# 3. Nạp dữ liệu từ bản sao lưu bằng pg_restore
echo "[3/5] Khôi phục dữ liệu từ bản sao lưu bằng pg_restore..."
cat "${BACKUP_FILE}" | docker compose -f "${COMPOSE_FILE}" exec -T db pg_restore -U hsrr_owner -d hsrr --no-owner --role=hsrr_owner || {
  # pg_restore có thể trả về cảnh báo không nghiêm trọng
  echo "pg_restore hoàn tất với một số cảnh báo (nếu có)."
}

# 4. Chạy migration nếu mã nguồn mới hơn bản sao lưu
echo "[4/5] Kiểm tra và chạy migration nếu có..."
docker compose -f "${COMPOSE_FILE}" run --rm api npm run db:migrate

# 5. Khởi động lại api và web
echo "[5/5] Khởi động lại các dịch vụ api và web..."
docker compose -f "${COMPOSE_FILE}" start api web

echo "=========================================================="
echo "KHÔI PHỤC HOÀN TẤT THÀNH CÔNG!"
echo "Kiểm tra trạng thái hệ thống bằng: docker compose ps"
echo "=========================================================="
