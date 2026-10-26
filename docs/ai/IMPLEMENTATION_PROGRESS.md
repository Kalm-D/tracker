# Tiến độ Tracker Multi-AI

Ngày: 26/10/2026. Phiên bản được phép: **v0.1** (chỉ v0.1).
Trạng thái: **Partial / các phần chạy độc lập đã triển khai và kiểm thử; chưa hoàn thành v0.1**.
Nhánh: feature/tracker-multi-ai. Commit nền main: ff375dde18660ff9f1d3eef1138c1905f6791add.

Đã có Chatbox độc lập, owner login, 6 module vai trò v0.1, quant worker dùng engine cũ, BCTC adapter, đọc nguồn chính thức, RSS, Gateway Gemini/Groq có free guard, task/history/cancel, Critic code, kiểm thử và tài liệu.

Chạy thật: Data/Manager/Technical/Critic bằng code, đọc công bố Fed, RSS. Đã thử Fundamental ACB nhưng nguồn bị chặn. Chưa gọi LLM; 0 usage provider thực. Chưa có Strategy/Risk/Backtest/Monitoring Agent mới.

## Bước tiếp theo trong chính v0.1

1. Người dùng cấu hình bí mật ở secret manager: GEMINI_API_KEY/GEMINI_MODEL hoặc GROQ_API_KEY/GROQ_MODEL; xác minh Free Tier và billing OFF, sau đó bật cờ xác nhận. Không gửi key trong chat.
2. Khắc phục môi trường Vnstock theo thiết lập SDK chính thức, xác minh điều khoản/Community/CI trước khi dùng; chạy ACB và so sánh MBB/TCB thật.
3. Cài/kiểm thử parser PDF trên tài liệu thật, kiểm tra đơn vị và ngày công bố BCTC; đánh giá semantic financial validation.
4. Chạy Technical/Fundamental/News/Critic bằng model thật và kiểm thử phản biện/prompt injection, xem token/quota. Bổ sung kiểm soát RPM/TPM theo tài khoản.
5. Thống nhất nơi chạy Node Quant/Python trên cloud miễn phí và cấu hình Cloudflare/D1 sau khi xác nhận tài khoản/giới hạn; chưa có staging cloud.
6. Kiểm tra Safari/iPhone thật, keyboard, HTTPS/cookie deployment.
7. Chạy lại kiểm thử và báo cáo nghiệm thu v0.1. Chỉ khi đủ điều kiện mới xin phê duyệt v0.2.

Không tự chạy v0.2, không merge main, không deploy production, không bật billing. Đọc file này, git status và commit hiện tại trước khi tiếp tục. Không làm lại phần PASS nếu không có thay đổi liên quan.

## Trạng thái bàn giao Git

Mã đã kiểm thử được giữ bằng commit cục bộ. Nhánh remote feature/tracker-multi-ai mới chỉ được tạo tại commit nền, chưa có mã AI. Việc tải 27 tệp thay đổi lên repository công khai bị kiểm tra phê duyệt tự động từ chối vì chưa có xác nhận trực tiếp của người dùng ngoài tệp đính kèm. Chưa tạo PR. Cần người dùng xác nhận đúng repository và payload trước khi gửi lại. Không dùng phương thức khác để vượt qua từ chối.
