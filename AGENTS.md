# Quy tắc làm việc cho agent lập trình (Antigravity)

Dự án: **MBF Risk Monitor**, website quản lý Hồ sơ rủi ro trọng yếu của MBF. Người giao việc (PM) là chủ dự án. Bạn là người lập trình. Đọc hết file này trước khi làm bất cứ việc gì.

## 1. Nguồn sự thật

Tài liệu trong `docs/` là nguồn sự thật duy nhất:
- `docs/prd.md`: yêu cầu nghiệp vụ.
- `docs/system-design.md`: hạ tầng, mô hình dữ liệu, bảo mật.
- `docs/backend-design.md`: quy tắc phía server, logic miền, import.
- `docs/frontend-design.md`: giao diện.
- `contracts/openapi.yaml`: **hợp đồng API giữa backend và frontend**, nguồn sự thật cho mọi endpoint (đường dẫn, quyền, schema, mã lỗi).
- `docs/README.md`: mục lục và các quyết định đã chốt.
- `docs/antigravity/`: bản giao việc cho từng kế hoạch. **Làm đúng bản giao việc hiện hành.**
- `data/RRTY2026.MBF.xlsx`: dữ liệu nguồn thật. **Không sửa, không ghi đè, không đổi tên.**

## 2. Quy tắc bắt buộc

1. **Bám sát tài liệu.** Không tự ý thêm hoặc bớt tính năng, bảng, cột, màn hình, thư viện, thao tác, mã lỗi hay quy tắc nghiệp vụ so với tài liệu. Không làm trước việc của kế hoạch sau. Không "cải tiến" ngoài yêu cầu.
2. **Không hiểu thì hỏi ngay.** Gặp chỗ tài liệu mơ hồ, thiếu, mâu thuẫn nhau, hoặc không chắc mình hiểu đúng: **dừng đúng phần đó**, hỏi PM trong khung chat, đồng thời ghi câu hỏi vào `docs/hoi-dap.md` (mẫu có sẵn ở đầu file). Làm tiếp các phần không bị ảnh hưởng. Chờ trả lời rồi mới làm phần bị chặn.
3. **Không bịa.** Không bịa số liệu, mã, tên đơn vị, quy tắc, giá trị mặc định, thông số, kết quả chạy. Giá trị nào không có trong tài liệu hoặc trong file Excel thì phải hỏi, không điền tạm. Dữ liệu giả lập phục vụ kiểm thử phải nằm riêng trong thư mục kiểm thử và ghi rõ là giả lập.
4. **Không báo xong khi chưa chạy.** Chỉ nói một việc "xong" sau khi đã chạy lệnh kiểm tra tương ứng và dán nguyên văn kết quả. Không chạy được (ví dụ không có Docker) thì nói rõ là không chạy được và vì sao. Tuyệt đối không giả lập (ví dụ thay PostgreSQL bằng SQLite) để cho test qua.
5. **Mỗi việc nhỏ: test trước, rồi code, rồi chạy test, rồi commit.** Commit nhỏ, một việc một commit, thông điệp tiếng Anh theo dạng `feat:`, `fix:`, `test:`, `docs:`, `chore:`.
6. **Gặp lỗi thì tìm nguyên nhân gốc trước khi sửa.** Ghi vào nhật ký lỗi (mục 4). Không sửa mò, không xóa test cho qua, không nới điều kiện kiểm tra để test xanh.
7. **Không động vào bí mật và dữ liệu thật.** Không commit file `.env`, mật khẩu, khóa. **Không đặt mật khẩu hay khóa mặc định trong mã, trong compose hay trong test, kể cả mật khẩu "chỉ để phát triển"**: thiếu biến môi trường thì dừng và báo rõ tên biến. Không ghi mật khẩu hoặc token vào log. Không đưa nội dung Excel thật ra ngoài máy (không gửi lên dịch vụ nào).
8. **Hai ứng dụng, hai phạm vi.** Repo gồm backend `apps/api` (NestJS) và frontend `apps/web` (Next.js). Agent backend chỉ sửa `apps/api` (và `docker/`, `data/` khi bản giao việc nói rõ). Agent frontend chỉ sửa `apps/web`. **Không sửa ứng dụng của bên kia.** Frontend không import mã của backend và ngược lại; hai bên chỉ chung hợp đồng.
9. **Hợp đồng là contract-first.** Không tự thêm, bớt hay đổi endpoint, trường, mã lỗi hay mã HTTP. Backend phải làm đúng `contracts/openapi.yaml`, frontend chỉ gọi endpoint có trong đó. Thấy hợp đồng thiếu hoặc sai thì dừng, hỏi PM; PM sửa hợp đồng và tài liệu trước, rồi mới sửa mã.
10. **Frontend không chứa logic nghiệp vụ** (chấm vùng, tiến độ, trạng thái, quyền). Mọi giá trị đã tính do API trả về.
11. **Ngôn ngữ.** Tài liệu và nhật ký bằng tiếng Việt. Tên biến, hàm, bảng, cột và thông điệp commit bằng tiếng Anh đúng như tài liệu. Thông báo cho người dùng cuối bằng tiếng Việt.

## 3. Khi code khác với tài liệu

Nếu để chạy đúng bạn buộc phải làm khác tài liệu, **không tự quyết**. Hỏi PM (mục 2.2). Chỉ sau khi PM đồng ý mới được làm khác, và phải:
1. Sửa **mọi** tài liệu liên quan trong `docs/` cho khớp nhau (kể cả `README.md`, mã FR/NFR, bảng ánh xạ, các con số).
2. Ghi vào nhật ký thay đổi, cột "Lệch tài liệu".

## 4. Sau khi code xong một kế hoạch

Bắt buộc tạo hoặc cập nhật, trước khi báo hoàn thành:
1. **Tài liệu:** đối chiếu code với `docs/`. Chỗ nào code đã làm rõ thêm điều tài liệu chưa nói thì bổ sung vào tài liệu (có PM đồng ý nếu là thay đổi ý nghĩa). Giữ các file khớp nhau.
2. **`docs/nhat-ky/ke-hoach-N.md`** (N là số kế hoạch), tạo từ mẫu `docs/nhat-ky/_mau.md`, gồm: các thay đổi đã làm, các điểm lệch so với tài liệu, và **mọi lỗi gặp phải** kèm hiện tượng, nguyên nhân gốc, cách xử lý, cách kiểm chứng đã sửa.
3. **`docs/hoi-dap.md`:** mọi câu hỏi đã hỏi và câu trả lời, để người sau không hỏi lại.
4. **Nhật ký phải trung thực.** Mỗi ô đã đánh dấu hoàn thành, mỗi câu "không có lệch tài liệu", "không có lỗi", "không có câu hỏi mở" phải có bằng chứng (kết quả lệnh, commit, tên test). Không có bằng chứng thì không đánh dấu. Hạng mục chưa làm hoặc làm dở phải ghi ở mục "Việc chưa làm", không được bỏ qua.
5. **Báo cáo cuối** gửi PM: danh sách việc đã xong kèm kết quả lệnh kiểm tra, việc chưa xong và lý do, câu hỏi còn mở.

## 5. Nguyên tắc kỹ thuật chung (đã chốt trong tài liệu)

- TypeScript. Backend: NestJS (`apps/api`), PostgreSQL 16, Drizzle ORM, `exceljs`, `zod`, `vitest`. Frontend: Next.js App Router (`apps/web`), Tailwind, shadcn/ui, Recharts.
- Phân lớp backend: `http/controllers` → `server/services` → `server/db`; `lib/domain` và `lib/import` thuần, không import từ `server/` hay `http/` (backend-design mục 1).
- Mã luôn ở dạng đã chuẩn hóa: không khoảng trắng, không tiền tố `MBF_`.
- Trạng thái bản nộp: `pending`, `approved`, `rejected`, `withdrawn`.
- Ngày dùng 00:00 UTC của đúng ngày; cột cơ sở dữ liệu kiểu `date`.
