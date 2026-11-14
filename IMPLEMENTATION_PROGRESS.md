# Tracker AI — tiếp tục từ đây

Phiên bản được người dùng cho phép: **v1.0 Production Hardening**, release candidate **1.0.0-rc.1**. Trạng thái toàn hệ thống: **Partial**. Lộ trình gốc đi từ v0.3 tới v1.0.

- [Báo cáo v1.0](docs/ai/V1_0_REPORT.md)
- [Vận hành, sao lưu và khôi phục](docs/ai/OPERATIONS.md)
- [Tiến độ và việc còn thiếu](docs/ai/IMPLEMENTATION_PROGRESS.md)
- [Báo cáo v0.3](docs/ai/V0_3_REPORT.md)
- [Báo cáo v0.2 đã công khai](docs/ai/V0_2_REPORT.md)

Nhánh cục bộ: feature/tracker-ai-v1.0-hardening, kế thừa v0.3. Preview http://127.0.0.1:8794/ chỉ hoạt động trên máy hiện tại khi server chạy. 113/113 test cục bộ PASS. Chưa tải v0.3/v1.0 lên GitHub, chưa merge main/deploy production. v0.2 vẫn ở PR nháp #12.

Còn thiếu nghiệm thu model API thật, BCTC chuẩn hóa thật, cloud và iPhone/Safari HTTPS. Không coi fixture hoặc cấu hình là bằng chứng nghiệm thu.

Kiểm tra tổng hợp mới: xem [COMPATIBILITY_REPORT.md](docs/ai/COMPATIBILITY_REPORT.md). Người dùng đã cho phép triển khai khi đạt kiểm tra; còn chặn backend/API production, không cần xin lại quyền đã có.

Backend: đã chuẩn bị production.cjs, /healthz, systemd/Caddy và cấu hình server. Xem docs/ai/CLOUD_BACKEND.md. Chưa có quyền truy cập tài khoản/VPS để triển khai thực.
