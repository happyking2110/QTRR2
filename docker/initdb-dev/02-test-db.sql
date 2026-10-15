-- Script tạo cơ sở dữ liệu hsrr_test chỉ dùng cho môi trường phát triển / kiểm thử
-- Được mount thêm vào docker-entrypoint-initdb.d trong docker-compose.dev.yml
-- Máy chủ production tuyệt đối không chạy script này

SELECT 'CREATE DATABASE hsrr_test OWNER hsrr_owner'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hsrr_test')\gexec

GRANT ALL PRIVILEGES ON DATABASE hsrr_test TO hsrr_owner;
GRANT CONNECT ON DATABASE hsrr_test TO hsrr_app;
