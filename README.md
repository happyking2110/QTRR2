# MBF Risk Monitor — Hệ thống Quản lý Hồ sơ Rủi ro Trọng yếu

Hệ thống quản lý, giám sát và đánh giá Hồ sơ rủi ro trọng yếu (HSRRTY), Kế hoạch hành động và Chỉ số rủi ro (KRI/KCI) dành cho Tổng công ty Viễn thông MobiFone.

---

## 1. Kiến trúc hệ thống

Dự án được xây dựng theo mô hình Monorepo:
* **Backend API (`apps/api`)**: NestJS 12, PostgreSQL 16, Drizzle ORM, Zod, ExcelJS, Argon2id, Vitest.
* **Frontend Web (`apps/web`)**: Next.js 14 (App Router), React 18, Tailwind CSS, Radix UI / shadcn, Recharts, Lucide Icons.
* **Hợp đồng API (`contracts/`)**: Đặc tả OpenAPI 3.1 (`contracts/openapi.yaml`) tiếp cận Contract-First gồm 76+ API operations chuẩn hóa.
* **Hạ tầng & Vận hành (`docker/`, `ops/`)**: Docker Compose, PostgreSQL 16 với pgdata volume, backup scheduler và audit logging tự động.

---

## 2. Các tính năng nổi bật (Phiên bản mới nhất v0.6.0)

1. **Quản lý Chi tiết Hồ sơ Rủi ro Trọng yếu**:
   - Giao diện cuộn mượt mà với 7 khối chức năng: Thẻ tóm tắt thông tin, Đánh giá rủi ro tiềm tàng & còn lại, Nguyên nhân (NN), Mức độ ảnh hưởng (AH), Biện pháp kiểm soát (KS), Kế hoạch hành động (KH), Chỉ số rủi ro & kiểm soát (KRI/KCI).
   - Biểu đồ phân bổ trạng thái trực quan: Biểu đồ thanh ngang phân bổ tiến độ kế hoạch hành động và phân bổ vùng trạng thái chỉ số KRI/KCI.
2. **Thiết lập Ngưỡng và Mục tiêu KRI/KCI**:
   - Ngăn kéo cấu hình linh hoạt: Loại đơn vị (phần trăm, số lượng, tiền tệ, ngày...), nhãn hiển thị đơn vị, chiều hướng chỉ số (càng cao càng xấu / càng thấp càng xấu), giá trị ngưỡng cảnh báo Vàng và ngưỡng báo động Đỏ, giá trị mục tiêu.
3. **Thanh điều hướng & Danh mục Mã Rủi ro nhanh**:
   - Menu xổ xuống danh mục mã rủi ro (CN02.R13, CN03.R14, HD11.R27, TT07.R46...) được cấu trúc dạng thư mục giúp tra cứu và điều hướng tức thì tới từng hồ sơ.
4. **Hàng Chờ duyệt tích hợp Menu người dùng**:
   - Mục "Chờ duyệt" được bố trí trang nhã ngay dòng đầu tiên trong Menu tài khoản người dùng với huy hiệu số đếm cá nhân hóa:
     - **Admin / Ban 4**: Hiển thị tổng số lượng yêu cầu nộp trên toàn hệ thống cần xử lý.
     - **Cán bộ Đơn vị**: Hiển thị số lượng yêu cầu nộp của chính đơn vị mình đang chờ duyệt.
5. **Bộ chọn Chu kỳ & Kỳ báo cáo tự động đồng bộ**:
   - Bộ chọn chu kỳ năm (2026, 2027, 2028...) và lọc kỳ Quý tự động, ẩn các kỳ tháng không cần thiết, tự động nạp danh sách kỳ tương ứng khi thay đổi chu kỳ.
6. **Báo cáo & Xuất dữ liệu Biểu mẫu BM06**:
   - Hỗ trợ xuất file Excel chuẩn BM06, Báo cáo tổng quan, và chế độ in ấn A4 chuẩn WCAG AA.

---

## 3. Yêu cầu môi trường

* **Node.js**: >= 20.x
* **npm**: >= 10.x
* **PostgreSQL**: 16.x (hoặc chạy qua Docker)
* **Docker & Docker Compose**

---

## 4. Hướng dẫn cài đặt & Khởi chạy

### Cách 1: Chạy bằng Docker Compose (Khuyên dùng)

1. **Cấu hình file môi trường:**
   ```bash
   cp .env.example .env
   ```
   Đảm bảo các biến mật khẩu và bí mật phiên được cấu hình trong `.env` (`POSTGRES_PASSWORD`, `HSRR_OWNER_PASSWORD`, `HSRR_APP_PASSWORD`, `SESSION_SECRET`).

2. **Khởi động dịch vụ:**
   - **Môi trường Tiêu chuẩn (Production-ready):**
     ```bash
     docker compose up -d
     ```
   - **Môi trường Phát triển (Mở thêm cổng PostgreSQL 5432 và API 3001 cho máy host):**
     ```bash
     docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
     ```

3. **Khởi tạo dữ liệu mẫu (Seed Data):**
   ```bash
   # Nạp dữ liệu hồ sơ rủi ro mẫu từ file Excel gốc
   docker compose exec api npm run db:seed
   ```

4. **Truy cập ứng dụng:**
   * **Giao diện Web**: [http://localhost:3000](http://localhost:3000)
   * **API Backend**: [http://localhost:3001/api/health](http://localhost:3001/api/health)

---

### Cách 2: Chạy trực tiếp trên máy phát triển (Local Development)

1. **Cài đặt các gói phụ thuộc:**
   ```bash
   npm install
   ```

2. **Cấu hình môi trường:**
   ```bash
   cp .env.example .env
   # Chỉnh sửa DATABASE_URL và DATABASE_MIGRATE_URL trỏ tới PostgreSQL của bạn
   ```

3. **Chạy Migration và Khởi tạo dữ liệu:**
   ```bash
   npm run db:migrate -w @hsrr/api
   npm run db:seed -w @hsrr/api
   ```

4. **Biên dịch và chạy ứng dụng:**
   * **Chế độ phát triển (Dev):**
     * Terminal 1 (API): `npm run dev -w @hsrr/api` (cổng 3001)
     * Terminal 2 (Web): `npm run dev -w @hsrr/web` (cổng 3000)
   * **Chế độ Production:**
     ```bash
     npm run build
     # Chạy API:
     node --env-file=.env apps/api/dist/main.js
     # Chạy Web:
     npm run start -w @hsrr/web
     ```

5. **Chạy kiểm thử toàn diện:**
   ```bash
   # Chạy toàn bộ 1.152 unit/integration/contract tests
   npm test
   ```

---

## 5. Tài khoản người dùng mẫu

Hệ thống cấu hình sẵn các tài khoản thử nghiệm theo các vai trò nghiệp vụ:

| Vai trò | Email đăng nhập | Mật khẩu mặc định | Đơn vị trực thuộc | Ghi chú quyền hạn |
| :--- | :--- | :--- | :--- | :--- |
| **Quản trị viên** | `admin@mobifone.vn` | `Password@123` | Ban 4 | Toàn quyền phê duyệt, chu kỳ, người dùng, cấu hình |
| **Ban QLRR (Ban 4)** | `ban4@mobifone.vn` | `Password@123` | Ban 4 | Giám sát toàn thể, phân công, đánh giá rủi ro còn lại, xuất BM06 |
| **Cán bộ Đơn vị TT1** | `tt1@mobifone.vn` | `Password@123` | Trung tâm 1 | Nhập số liệu KRI/KCI, cập nhật tiến độ đầu việc phụ trách |
| **Cán bộ Đơn vị MBF 1**| `mbf1@mobifone.vn` | `Password@123` | MBF KV 1 | Cập nhật tiến độ đầu việc được giao tại khu vực |
| **Người xem (Viewer)**| `viewer@mobifone.vn` | `Password@123` | TCT MobiFone | Xem dashboard, tra cứu hồ sơ, ma trận nhiệt, xuất báo cáo |

> [!NOTE]
> Mật khẩu mặc định của tất cả tài khoản mẫu khởi tạo là `Password@123`.

---

## 6. Tài liệu hướng dẫn sử dụng chi tiết

Vui lòng tham khảo cẩm nang hướng dẫn sử dụng kèm ảnh minh họa và quy trình thao tác từng bước tại:
👉 **[docs/huong-dan/huong-dan-su-dung.md](docs/huong-dan/huong-dan-su-dung.md)**
