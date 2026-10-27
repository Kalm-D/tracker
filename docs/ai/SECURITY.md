# Bảo mật bản thử nghiệm

Đã có và đã test: mật khẩu owner hash scrypt với salt; cookie HttpOnly/SameSite; TTL 2 giờ; CSRF cho thay đổi trạng thái; CORS theo exact Origin; giới hạn login, session, request, queue, body; API bị tắt khi flag off; backend không nằm trong public; API key chỉ ở server; đọc tài liệu chỉ từ allowlist; redirect/IP/size/time limits; AI không thể chạy shell hoặc tự chọn endpoint.

Prompt hệ thống xem câu hỏi, web và BCTC là dữ liệu không đáng tin. Provider chỉ được trả JSON có nguồn; không có quyền công cụ do model tự cấp. Nội dung render bằng textContent, không chèn HTML/Markdown thô. Shadow DOM tránh CSS của Chatbox làm ảnh hưởng Tracker.

## Chưa đạt điều kiện production

- Chưa pentest, chưa đánh giá prompt injection với model thật. Quy tắc prompt không phải biện pháp bảo mật tuyệt đối.
- Chỉ owner cho preview; chưa SSO, phân quyền nhiều tài khoản hoặc D1.
- Chưa triển khai TLS/reverse proxy/Cloudflare Access; mặc định chỉ listen 127.0.0.1.
- Python PDF cần sandbox tài nguyên ở môi trường production; PDF scan/OCR chưa có.
- Số liệu nguồn chưa kiểm chứng ngữ nghĩa đầy đủ.
- Chưa có cảnh báo ngân sách theo provider hoặc kiểm tra billing tự động. Chỉ cấu hình dự án free, không bật billing; cờ trong ứng dụng không chặn được phí nếu quản trị cấu hình sai tài khoản.

Không đưa mật khẩu thật, API key, cookie, dữ liệu job hoặc .env vào commit. .ai-jobs và .env.* được ignore. Mật khẩu thử UI là thông tin tạm trong tiến trình preview, không có trong source.

## Bổ sung v0.2

Biểu mẫu vốn/danh mục chỉ được code tính. projectEvidence loại vốn, holdings, số lượng và tổng lãi/lỗ cá nhân trước khi gọi model. Client không thể tự gán verified/reported cho số giả định. Cấu hình chiến lược có whitelist, kiểm tra tiền/vị thế/ngành và giới hạn số học. Kịch bản không có quyền đặt lệnh.

## v0.3

Backtest dùng whitelist cấu hình, giới hạn 1–5 mã/60 phiên/20 vị thế, worker timeout 120s, hủy/terminate; V8 old generation 512MB không phải giới hạn toàn bộ process memory. Hash snapshot phải khớp giai đoạn Data. Evidence gửi model bỏ vốn, cash, tiền lãi/lỗ và số lượng. Monitoring trong thư mục riêng bị gitignore, không có endpoint public; dùng owner auth/CSRF/Origin hiện có. Polling dùng chung nguồn, tối đa 20 bộ/200 sự kiện, không gọi model hay dịch vụ thông báo ngoài. File hỏng không bị âm thầm xóa.

## v1.0 RC

Thêm khóa runtime và ledger, từ chối state trong public/liên kết đường dẫn; cấu hình sai hoặc ledger hỏng chặn generation. Lỗi upstream không truyền nội dung tự do ra người dùng. Log chỉ trường whitelist, không prompt/key/cookie. UTF-8 body và HTTP timeout có giới hạn; bind remote yêu cầu HTTPS origin/Secure cookie (không tự cấp TLS). Dashboard owner cho thấy trần ngân sách/cooldown, nhưng vẫn chưa kiểm tra billing tự động. Backup riêng không có secrets, SHA256 chỉ kiểm tra toàn vẹn so với manifest, không phải chữ ký. Restore ledger giữ API 24 giờ. Xem OPERATIONS.md.

113 test là kiểm chứng code/giao thức, chưa thay pentest, kiểm tra model thật hoặc bảo mật triển khai HTTPS. Không có production deployment mới.
