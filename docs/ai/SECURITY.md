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
