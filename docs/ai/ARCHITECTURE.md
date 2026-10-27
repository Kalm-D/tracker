# Tracker AI v0.1 — kiến trúc và phạm vi thực tế

Trạng thái: **Partial / chưa nghiệm thu v0.1**. Mốc nền: ff375dde18660ff9f1d3eef1138c1905f6791add (main ngày 25/10/2026). Chỉ phát triển v0.1 trên feature/tracker-multi-ai.

## Thành phần đã viết

- public/ai: Chatbox tiếng Việt, Shadow DOM để tránh xung đột theme, responsive, ngữ cảnh Research Lab/modal, lịch sử, dừng/thử lại và trạng thái nguồn.
- server/ai/server.cjs: API độc lập, tài khoản owner cho bản thử nghiệm, cookie HttpOnly, scrypt, CSRF, exact Origin, giới hạn đăng nhập và yêu cầu.
- Research: hàng đợi một tác vụ đang chạy, tối đa 3 tác vụ chờ/chạy, lưu kết quả trung gian bằng ghi file nguyên tử, timeout, hủy và lịch sử. Sau restart, job dở chuyển blocked; người dùng chủ động thử lại.
- Quant Worker: gọi trực tiếp Backtest.prepare/snapshot và Tracker Engine; không viết lại công thức. Tính trên toàn bộ universe trước khi chọn mã để giữ nguyên RS và breadth. Loại trường rows khỏi ngữ cảnh LLM.
- Sources: Vnstock Finance qua Python cố định; đọc HTML/PDF từ host chính thức trong allowlist; RSS chỉ phát hiện tin.
- Gateway: Gemini/Groq qua server, model do quản trị cấu hình và kiểm tra danh mục bằng API, JSON Schema, cache, giới hạn ngân sách nội bộ và fallback chỉ giữa các provider đã xác nhận free.
- Critic: kiểm tra hợp đồng, nguồn và các số liệu có mặt trong nguồn; phản biện giá người dùng nêu so với snapshot; có vai trò phản biện LLM khi model khả dụng.

## Hạ tầng và giới hạn chưa giải quyết

Bản thử nghiệm chạy bằng Node.js trên máy hiện tại; đây chưa phải backend cloud. Không triển khai Cloudflare Workers/D1/Workflows, không tạo tài khoản và không bật billing.

Tái sử dụng toàn bộ engine trên snapshot 353.123 bar cần Node Worker. Không đưa khối tính toán này vào Workers Free khi chưa đo CPU và xác nhận giới hạn. Cloudflare có thể làm lớp API và D1 sau khi xác định nơi chạy Quant/Python hợp lệ, quyền tài khoản và hạn mức. Chưa có bằng chứng một cấu hình cloud miễn phí đáp ứng yêu cầu 24/7 của toàn hệ thống.

Lịch sử đang lưu trong thư mục riêng của Node, chưa đồng bộ đa thiết bị và chưa có D1. Không tuyên bố khả năng khôi phục giữa nhiều máy hoặc tự tiếp tục sau restart.

## Phạm vi giữ nguyên

public/index.html chỉ thêm hai script AI và một comment. Các công thức, engine, CSV, data, exporter, workflow dữ liệu, tab và UI cũ không sửa. Flag mặc định tắt trên GitHub Pages. Không triển khai v0.2, không merge main hoặc deploy production.

## Phần bổ sung v0.2

Người dùng đã cho phép bắt đầu v0.2 ngày 26/10/2026. Xem STRATEGY_RISK.md và V0_2_REPORT.md. Thêm strategy-config.cjs/risk.cjs/strategy.cjs, request schemaVersion=2 khi có chiến lược, evidence tính toán và Strategy UI riêng. Các đoạn v0.1 ở trên là lịch sử; không còn là phạm vi được phép duy nhất. Engine/dữ liệu cũ vẫn không thay đổi.

## Phần bổ sung v0.3

Người dùng cho phép tiếp tục v0.3 ngày 26/10/2026. Backtest worker tái sử dụng engine; Monitoring lưu trạng thái và polling file snapshot trong tiến trình Node, API owner/CSRF cũ. Chi tiết ở BACKTEST_MONITORING.md, kết quả ở V0_3_REPORT.md. Các đoạn phạm vi v0.1/v0.2 ở trên là lịch sử; các giới hạn cloud/model/BCTC vẫn còn.

## v1.0 RC — phạm vi hiện tại

Người dùng cho phép mốc v1.0 sau v0.3. Gateway dùng TokenManager với ledger bền, quota theo provider, retry/cooldown/routing có giới hạn. Operations quản lý khóa một runtime, log whitelist, tài nguyên và dashboard owner. Research/Monitoring giữ file hỏng và chặn ghi khi lỗi; backup/restore offline qua tools/ai-state.cjs. Đây vẫn là filesystem local một process, chưa D1/cloud. Các phần mô tả phạm vi v0.1 ở trên là lịch sử. Xem V1_0_REPORT.md và OPERATIONS.md cho trạng thái hiện tại; engine/data/workflow giữ nguyên.
