# Chạy thử và triển khai

## Preview trên máy

Cần Node.js >=22. Trong repository:

    node tools/setup-ai.cjs
    node --env-file=.env.ai server/ai/server.cjs

Mở http://127.0.0.1:8790 và chọn “Nghiên cứu AI”. Script setup yêu cầu mật khẩu ít nhất 12 ký tự, lưu hash trong .env.ai, không ghi mật khẩu. Không ghi đè cấu hình đã có. API sinh nội dung chưa chạy nếu chưa cấu hình model; Quick kỹ thuật vẫn dùng dữ liệu thật.

Tùy chọn Python: cài requirements trong môi trường riêng, tự hoàn tất cấu hình/điều khoản Vnstock và kiểm tra nguồn. Chỉ định executable bằng TRACKER_AI_PYTHON. Không chạy pip hoặc thay đổi máy chủ production từ workflow dữ liệu hiện tại.

## Kết nối model

1. Tạo key trong Google AI Studio hoặc GroqCloud trên dự án miễn phí, billing chưa bật.
2. Lưu key bằng secret manager ở máy chủ; không dán vào hội thoại hoặc frontend. Local development có thể thêm vào .env.ai đã được ignore.
3. Chọn model tồn tại trong tài khoản và kiểm tra free-tier hiện hành.
4. Cấu hình tên model và *_FREE_TIER_CONFIRMED=true sau khi kiểm tra.
5. Khởi động lại backend và chạy toàn bộ ca nghiệm thu thật.

ChatGPT Plus không cung cấp API token cho ứng dụng. Chưa cấu hình model mặc định và chưa xác minh quota tài khoản.

## Cloud / Pages

Chưa có staging cloud hay deploy production. Không bật public/ai/config.js trên Pages khi backend chưa được bảo vệ và kiểm thử từ iPhone thật.

Kiến trúc dự kiến cần Cloudflare API gateway/D1 và nơi chạy Node Quant/Python; chưa chọn máy chủ miễn phí 24/7 và chưa đo giới hạn. Không đưa engine nặng vào Workers Free. Tham chiếu giới hạn: https://developers.cloudflare.com/workers/platform/limits/

Để dùng backend khác origin, cần HTTPS, TRACKER_AI_ALLOWED_ORIGIN chính xác, cookie Secure/SameSite=None và kiểm tra chính sách cookie Safari. Chưa xác minh trường hợp này; ưu tiên cùng origin trên staging đã được phê duyệt.

## Backup / rollback

- Git branch nền: ff375dde18660ff9f1d3eef1138c1905f6791add.
- Không có main merge hoặc deployment phải quay lui trong phiên này.
- Tắt AI: TRACKER_AI_ENABLED=false; trên Pages config.enabled=false vẫn là mặc định.
- v1.0: dùng công cụ backup/verify/restore offline theo OPERATIONS.md. Secrets không nằm trong backup state; bảo vệ riêng, không commit. Không copy đè ledger đang hoạt động.
- Phục hồi job dở: trạng thái blocked, kiểm tra dữ liệu rồi chủ động Thử lại.
- Nếu sau này merge, revert commit AI sau kiểm thử. Không revert data/workflow của tác vụ khác.

## Kiểm thử

    node tools/check-scripts.cjs
    node --test tests/*.test.cjs
    node tools/audit-data.cjs

Cần đầy đủ lịch sử git cho test đối chiếu engine với commit 007e5c36. Workflow kiểm thử hiện có đã checkout fetch-depth:0; không thay workflow dữ liệu.

## v0.3 local

Khởi động cùng Node server hiện có. Không thêm dependency. Backtest chạy trong worker; bản thử tối đa 60 phiên/1–5 mã, máy cần đủ CPU/RAM cho toàn universe. Monitoring tự kiểm tra file dữ liệu mỗi 60 giây khi server/flag bật và có bộ theo dõi đang bật. Tắt máy/server sẽ dừng; không có background cloud. File monitors ở TRACKER_AI_JOBS_DIR/monitoring/monitors.json, nên sao lưu cùng jobs. Không mở nhiều process cùng ghi một thư mục jobs/monitoring. Khi restore phải giữ quyền thư mục và schema/version; xem BACKTEST_MONITORING.md.

## v1.0 release candidate

Xem OPERATIONS.md cho runbook, khóa, trần tài nguyên, backup/restore và rollback tương thích ledger. Preview phiên này: http://127.0.0.1:8794/. Version 1.0.0-rc.1, local Partial. Chưa tải v0.3/v1.0 lên GitHub hoặc deploy; flag public vẫn false. Kế hoạch production phải có nghiệm thu thực và phê duyệt riêng.
