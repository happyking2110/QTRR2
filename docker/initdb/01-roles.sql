-- Script khởi tạo role và database cho MBF Risk Monitor
-- Chạy tự động khi khởi tạo container db lần đầu bởi user postgres

\getenv owner_pw HSRR_OWNER_PASSWORD
\getenv app_pw HSRR_APP_PASSWORD

\if :{?owner_pw}
\else
  \echo 'Lỗi khởi tạo: thiếu biến môi trường HSRR_OWNER_PASSWORD'
  \q 1
\endif

\if :{?app_pw}
\else
  \echo 'Lỗi khởi tạo: thiếu biến môi trường HSRR_APP_PASSWORD'
  \q 1
\endif

-- Tạo hoặc cập nhật role hsrr_owner (không có quyền CREATEDB theo F1.5)
SELECT format('ALTER ROLE hsrr_owner WITH LOGIN PASSWORD %L', :'owner_pw')
WHERE EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'hsrr_owner')\gexec

SELECT format('CREATE ROLE hsrr_owner WITH LOGIN PASSWORD %L', :'owner_pw')
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'hsrr_owner')\gexec

-- Tạo hoặc cập nhật role hsrr_app
SELECT format('ALTER ROLE hsrr_app WITH LOGIN PASSWORD %L', :'app_pw')
WHERE EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'hsrr_app')\gexec

SELECT format('CREATE ROLE hsrr_app WITH LOGIN PASSWORD %L', :'app_pw')
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'hsrr_app')\gexec

-- Tạo cơ sở dữ liệu hsrr do hsrr_owner sở hữu (máy chủ thật chỉ có hsrr)
SELECT 'CREATE DATABASE hsrr OWNER hsrr_owner'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hsrr')\gexec

GRANT ALL PRIVILEGES ON DATABASE hsrr TO hsrr_owner;
GRANT CONNECT ON DATABASE hsrr TO hsrr_app;

