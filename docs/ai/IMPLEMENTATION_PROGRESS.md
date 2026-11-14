# Tiến độ Tracker AI — v1.0 RC

Ngày 26/10/2026. Người dùng yêu cầu tiếp tục phiên bản kế tiếp; lộ trình gốc v0.1 → v0.2 → v0.3 → v1.0. Đã thực hiện hardening trên nhánh local feature/tracker-ai-v1.0-hardening từ v0.3 2e04eae. Trạng thái **Partial**, xem V1_0_REPORT.md.

v0.2 đã công khai tại PR nháp #12 https://github.com/Kalm-D/tracker/pull/12; CI cuối https://github.com/Kalm-D/tracker/actions/runs/40278418597. v0.1 #11/v0.2 #12 chưa merge. v0.3 và v1.0 vẫn local; chưa có GitHub CI cho chúng.

Đã hoàn thiện Token Manager bền, trần nội bộ theo provider, retry/cooldown/routing, dashboard vận hành, khóa runtime, phục hồi lỗi lưu trữ, công cụ backup/verify/restore và test bảo mật/hồi quy. 113/113 test PASS, 25 script parse. Giữ nguyên engine, data/CSV/exporter và workflows. Public flag false.

## Tiếp tục từ đây

1. Đọc git status/log, V1_0_REPORT.md và OPERATIONS.md; không ghi đè thay đổi chưa commit của người dùng.
2. Preview http://127.0.0.1:8794/ chỉ trên máy hiện tại khi process chạy. Tự chạy với tài khoản riêng bằng tools/setup-ai.cjs, không dùng mật khẩu test.
3. Chỉ cấu hình secret qua server/secret manager. Còn thiếu model thật, nguồn BCTC chuẩn hóa thật, tài khoản/runtime cloud và nghiệm thu iPhone HTTPS. Không xin key trong chat.
4. Không tự tăng trần/bật paid, mua credit, đặt lệnh hoặc reset quota. Backup/restore offline theo OPERATIONS.md.
5. Không coi fixture hoặc 113 test là nghiệm thu production. Chỉ khi các điều kiện thực được kiểm chứng mới trình kế hoạch công khai/merge/deploy để được phê duyệt.
6. Chưa bắt đầu phiên bản sau v1.0 hoặc tự công khai v0.3/v1.0. Các báo cáo cũ là lịch sử; dòng “v0.4” trong báo cáo v0.3 không thay đổi lộ trình gốc.
