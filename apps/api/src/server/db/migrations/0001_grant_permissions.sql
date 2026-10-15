-- Cấp quyền cho role hsrr_app theo system-design 5.5:
-- hsrr_app có SELECT, INSERT, UPDATE, DELETE trên các bảng nội dung;
-- trên audit_log chỉ có SELECT và INSERT (bất biến nhật ký).

GRANT USAGE ON SCHEMA public TO hsrr_app;

-- Cấp quyền trên toàn bộ các bảng hiện có
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hsrr_app;

-- Thu hồi quyền UPDATE và DELETE trên audit_log đối với hsrr_app
REVOKE UPDATE, DELETE ON TABLE audit_log FROM hsrr_app;

-- Cấp quyền sequence (cho bigserial của audit_log.id)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hsrr_app;

-- Thiết lập mặc định cho các đối tượng mới
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hsrr_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO hsrr_app;
