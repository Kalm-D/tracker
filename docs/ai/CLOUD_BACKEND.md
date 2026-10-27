# Backend cloud — bản chuẩn bị ngày 26/10/2026

Trạng thái: **đã chuẩn bị và kiểm thử tại máy; chưa triển khai cloud**. Chưa có tài khoản/VPS, hostname HTTPS và tài khoản owner thật để cấu hình. Không tự tạo tài khoản, bật billing hoặc mua dịch vụ.

## Đã làm

- server/ai/production.cjs: khởi động riêng cho production; yêu cầu HTTPS origin, cookie Secure, hash owner, đường dẫn state và snapshot tuyệt đối, free mode rõ ràng; chạy Quant worker kiểm tra nguồn thật trước khi mở cổng. Từ chối demo và sổ quota/monitor hỏng.
- /healthz: GET/HEAD, chỉ trả status ok/unavailable, Cache-Control no-store; không trả model, key, nguồn, đường dẫn hoặc dữ liệu riêng. Đây là kiểm tra runtime, không phải chứng nhận nghiệm thu production/model/BCTC.
- deploy/tracker-ai/tracker-ai.service: chạy bằng user riêng, Node >=22, state riêng /var/lib/tracker-ai, quyền file hạn chế, restart-on-failure, giới hạn RAM 2 GiB.
- deploy/tracker-ai/Caddyfile.example: cấu hình reverse proxy HTTPS cùng origin, phục vụ cả Tracker lẫn API qua Node.
- deploy/tracker-ai/backend.env.example: biến cấu hình server riêng, không chứa secrets thật.
- Tests: 3 ca mới kiểm tra cấu hình, startup snapshot thật, health/auth/Origin/cookie, từ chối demo và bảo toàn ledger hỏng/giải phóng khóa. Tổng bộ kiểm thử **118/118 PASS** cục bộ, chưa cloud acceptance.

## Cấu trúc triển khai đề xuất

Một VPS Linux có Node >=22 và Caddy, bộ lưu bền, tối thiểu tài nguyên được kiểm chứng bằng tải thực trước khi mở dùng. Node chỉ listen 127.0.0.1:8790; Caddy công khai 80/443. Chỉ có một instance ghi state. Không áp dụng nguyên trạng cho dịch vụ có filesystem tạm, nhiều replica hoặc autoscaling.

Bản Node phục vụ toàn bộ Tracker cùng API trên hostname HTTPS riêng để đăng nhập cùng origin. Kết nối trực tiếp GitHub Pages sang backend khác site còn cần kiểm thử cookie Safari; không coi SameSite=None là bảo đảm hoạt động. Có thể dùng đường dẫn mở Tracker AI trên hostname backend trong lúc xác minh tích hợp Pages. Chưa sửa website Pages.

Render Free ngủ khi không có truy cập và không có persistent disk. Oracle Always Free có tài nguyên VM nhưng cần xác minh tài khoản/availability; máy idle có thể bị thu hồi. Không hứa cloud miễn phí 24/7 chắc chắn. Chưa chọn gói trả phí hoặc dùng trial làm production.
Nguồn đã đối chiếu 26/10/2026:
- https://render.com/docs/free
- https://docs.oracle.com/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm

## Chạy sau khi có máy chủ và hostname

Các bước dưới là kế hoạch, **chưa thực hiện trên máy chủ người dùng**:

1. Xác minh tài khoản, instance, khu vực, tài nguyên, storage và tổng chi phí trước khi tạo hoặc đổi cấu hình.
2. Chép checkout đã kiểm tra vào /opt/tracker-ai. Không chép .ai-jobs, work, .env hay mật khẩu kiểm thử. Snapshot bundled hiện ngày 23/10/2026; cần quy trình cập nhật nguồn riêng, không tự trở thành dữ liệu trực tiếp.
3. Tạo user hệ thống tracker-ai và state /var/lib/tracker-ai. Cài Node >=22 và Caddy từ nguồn chính thức; xác nhận /usr/bin/node. Không cài Python package/BCTC khi chưa kiểm tra điều khoản và phiên bản.
4. Tạo /etc/tracker-ai/backend.env từ mẫu; quyền 0600 chủ sở hữu root, dùng EnvironmentFile của systemd. Đặt hostname thật, hash owner riêng và secrets qua cơ chế server. Không dán secrets vào chat.
5. Trỏ DNS hostname về IP máy chủ, thay hostname trong Caddyfile; cho phép HTTP/HTTPS theo phạm vi cần thiết. Giữ cổng 8790 chỉ loopback. Sao lưu cấu hình Caddy trước khi nhập file mẫu; không ghi đè website có sẵn.
6. Cài unit vào /etc/systemd/system/tracker-ai.service, daemon-reload rồi start. Enable boot chỉ sau khi nghiệm thu. Kiểm tra status và journal, không xuất .env/headers/keys.
7. Kiểm tra HTTPS /healthz, login/session/CSRF, Quick thật, history/restart, cancel/timeout, monitor và backup/restore. Chưa cấu hình model thì Quick kỹ thuật vẫn chạy; chưa tuyên bố phân tích LLM/BCTC đã hoàn tất.
8. Đo RAM/CPU/dung lượng và thử iPhone/Safari thật. Chỉ tích hợp website chính thức sau khi URL/HTTPS/owner/storage được nghiệm thu.

## Crash và khôi phục

Sau crash còn .runtime.lock, không tự xóa khóa. Dừng service để ngăn restart loop; dùng node tools/ai-state.cjs unlock /var/lib/tracker-ai bằng user tracker-ai sau khi PID đã chết. Công cụ từ chối PID đang sống; nếu PID bị tái sử dụng cần kiểm tra riêng. Sau đó mới start service. Không dùng thư mục state này cho nhiều máy chủ.

Restart có kiểm soát: SIGTERM dừng nhận job, hủy job đang chạy, giữ kết quả trung gian. Session trong RAM hết hiệu lực sau restart nên cần đăng nhập lại; job dở không tự gọi lại model. Backup/restore và ledger hold theo OPERATIONS.md. Khi giám sát chưa nghiệm thu, không gọi đây là backend 24/7 hoàn tất.

## Quyền còn cần

Cần người dùng xác định tài khoản cloud/VPS có thể truy cập và cho phép đăng nhập để kiểm tra tài nguyên, chi phí và triển khai. Nếu chưa có tài khoản, người dùng tự hoàn tất đăng ký/điều khoản/xác minh thanh toán. Không gửi mật khẩu, SSH private key hoặc API key vào hội thoại.
