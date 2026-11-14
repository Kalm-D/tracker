# Vận hành v1.0 RC

Bản cục bộ một owner, một process Node >=22. Chưa có cloud 24/7 hoặc production acceptance. Không dùng mật khẩu test để triển khai thật.

## Khởi động và kiểm tra

1. Chạy node tools/setup-ai.cjs để tạo .env.ai riêng với hash mật khẩu. Giữ cấu hình/keys ở server; không đưa vào chat, git hoặc public.
2. Khởi động node --env-file=.env.ai server/ai/server.cjs. Chọn TRACKER_AI_JOBS_DIR là thư mục riêng ngoài public. Không chạy hai server dùng chung thư mục.
3. Mở Nghiên cứu AI → Vận hành sau đăng nhập. Kiểm tra nguồn/hash/ngày, model, trạng thái sổ, trần tài nguyên và các mục chưa nghiệm thu.
4. Với bind không phải loopback, backend yêu cầu Secure cookie và exact HTTPS origin. TLS/reverse proxy vẫn cần triển khai bên ngoài; cờ không tự tạo HTTPS.
5. Tắt TRACKER_AI_ENABLED khi cần ngừng tính năng; public/ai/config.js mặc định enabled=false.

Dashboard chỉ chủ sở hữu đọc được qua GET /api/ai/operations. Sự kiện đã lọc không có prompt, key, cookie hoặc nội dung nguồn. Lịch sử job và backup vẫn có thể chứa câu hỏi, vốn/danh mục; phải bảo vệ quyền thư mục.

## Tài nguyên và lỗi

Mặc định AI_MAX_RSS_MIB=1024, AI_MAX_STATE_MIB=256. Guard chặn nhận job mới khi vượt ngưỡng hoặc cấu hình sai; không phải cgroup hay giới hạn bộ nhớ cứng. RAM là process Node gồm worker threads, không gồm mọi process Python/hệ thống. Disk scan có giới hạn, cache mẫu 30 giây. Cần giám sát hạ tầng riêng khi triển khai.

operations.jsonl tối đa khoảng 1 MiB rồi rotate một bản; chỉ ghi các trường whitelist. Không dùng log này làm nhật ký kiểm toán bất biến. Cache generation là dữ liệu riêng; không public.

| Triệu chứng | Xử lý |
|---|---|
| Thiếu model | Cấu hình riêng key/model/free confirmation; xác minh tài khoản, khởi động lại rồi nghiệm thu |
| 429/cooldown hoặc hết trần | Chờ thời gian quy định, kiểm tra Vận hành và quota tài khoản; không tăng trần tự động |
| Lỗi sổ token | Dừng server, bảo toàn file, kiểm tra/khôi phục backup; không xóa sổ để tiếp tục call |
| State/disk/RAM vượt trần | Dừng nhận nghiên cứu mới, kiểm tra dung lượng và job; chỉ dọn bản cache/backup đã xác định thuộc phiên, không xóa lịch sử tùy tiện |
| Monitor/job hỏng | File được giữ; monitor hỏng chặn thay đổi/check, job hỏng được đếm; bảo toàn và kiểm tra nguồn trước sửa |
| Crash/restart | Job dở chuyển blocked, không tự gọi lại model; người dùng chủ động Thử lại |
| Khóa runtime cũ | Dừng đúng process; chỉ dùng unlock bên dưới sau khi xác minh PID đã chết |

## Sao lưu offline

Dừng server trước. Ví dụ đường dẫn dưới đây là chỗ giữ trạng thái riêng; thay bằng đường dẫn thực của bản đang chạy.

    node tools/ai-state.cjs backup .ai-jobs/production .ai-jobs/backups/2026-10-26
    node tools/ai-state.cjs verify .ai-jobs/backups/2026-10-26

Đích backup phải chưa tồn tại, ngoài thư mục nguồn và public. Công cụ lưu jobs/*.json, gateway/usage.json, monitoring/monitors.json; không lưu .env, keys, cookie/session, log hay cache. Tối đa 102 tệp, 8 MiB/tệp, 128 MiB tổng. Backup nhạy cảm cần quyền truy cập riêng; bảo vệ .env/secret manager bằng quy trình riêng. Chế độ file Unix không thay thế Windows ACL.

Manifest SHA256 phát hiện thay đổi nội dung so với manifest; không phải chữ ký xác thực chống người sửa đồng thời cả manifest và dữ liệu. Cần backup từ nguồn tin cậy. Thất bại IO có thể để lại thư mục mới chưa hoàn tất; không dùng nếu verify chưa đạt.

## Khôi phục

    node tools/ai-state.cjs verify .ai-jobs/backups/2026-10-26
    node tools/ai-state.cjs restore .ai-jobs/backups/2026-10-26 .ai-jobs/restored-2026-10-26

Restore chỉ vào thư mục chưa tồn tại, không ghi đè state đang dùng. Nếu có usage ledger, tạo restore-hold.json chặn generation 24 giờ để không xóa phần ngân sách đã dùng sau backup. Không xóa hold. Sau khi dừng server cũ, đổi TRACKER_AI_JOBS_DIR sang thư mục mới, cung cấp secrets riêng, khởi động và kiểm tra Vận hành/lịch sử/monitor. Không tự gọi lại job dở. Không bật hai thư mục thành hai runtime cùng dùng account quota.

Khóa bỏ lại sau crash:

    node tools/ai-state.cjs unlock .ai-jobs/production

Lệnh chỉ xóa khi .runtime.lock có PID hợp lệ đã chết và nội dung khóa chưa đổi. Nếu PID còn sống, PID bị tái sử dụng, thiếu khóa runtime hoặc có khóa quota đơn lẻ thì dừng và kiểm tra thủ công; không xóa để vượt cơ chế bảo vệ.

## Rollback

Tắt tính năng AI trước, dừng đúng tiến trình, sao lưu offline và giữ code/state hiện tại. Main/Pages chưa được thay đổi nên phiên này không có production deployment cần revert. Sau này chỉ revert commit AI đã xác định, không revert data/workflow của tác vụ khác.

v0.3 không đọc được schema usage v1.0. Không trỏ code cũ vào sổ v1 hoặc reset ngân sách. Dùng state cũ đã bảo toàn trong thư mục riêng; giữ model API tắt đến khi đối chiếu được mọi usage còn hiệu lực hoặc đã qua ít nhất 24 giờ không có call khác. Khi khôi phục qua công cụ v1, giữ nguyên marker 24 giờ. Chỉ bật API lại sau khi kiểm tra quota tài khoản. Đọc/kiểm tra dữ liệu kỹ thuật không cần gọi model.

## Kế hoạch trước production

1. Cấu hình server-only secrets/model trên tài khoản đã kiểm tra free/billing, nghiệm thu call thật, output/citation, timeout/cancel/fallback và usage. Không coi fixture là nghiệm thu.
2. Hoàn thiện nguồn BCTC thật và các kiểm tra ngày công bố/TTM/đơn vị/cổ tức; kiểm tra tình huống thiếu/sai nguồn.
3. Xác định tài khoản/runtime cloud, HTTPS/origin, storage bền, tài nguyên, quota và chi phí $0 khả thi; đo tải worker/Python và thử restore/rollback. Chưa có phương án miễn phí 24/7 được chứng minh.
4. Thử trình duyệt desktop và iPhone/Safari vật lý trên HTTPS, bảo mật session, lịch sử, hủy và bàn phím.
5. Trình diff, bằng chứng nghiệm thu, nguồn cấu hình/chi phí và kế hoạch rollback cụ thể để người dùng phê duyệt việc công khai/merge/deploy. Không tự thực hiện các bước công khai.

Node engine hiện tại không phải ứng dụng có thể đưa nguyên khối vào Cloudflare Workers. Tham khảo giới hạn chính thức, đã đối chiếu 26/10/2026: https://developers.cloudflare.com/workers/platform/limits/. Gateway/D1 cần thiết kế riêng nếu chọn; chưa được triển khai. GitHub Actions chỉ có thể là phương án chạy theo đợt được duyệt, không phải dịch vụ 24/7.
