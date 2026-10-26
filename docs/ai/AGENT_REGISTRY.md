# Đăng ký vai trò Agent — v0.2

Vai trò là module trong sản phẩm; không đồng nghĩa mỗi vai trò đã gọi một model.

| Vai trò | Trạng thái thực tế |
|---|---|
| Manager | Router code v1/v2, chỉ gọi vai trò cần thiết |
| Data | Snapshot thật, hash, audit; từ chối demo |
| Technical | Dùng nguyên Tracker/Backtest snapshot engine |
| Fundamental | Adapter đã viết; BCTC/runtime/metadata thật chưa nghiệm thu |
| News | Công cụ tài liệu/RSS v0.1; chưa phân tích model thật |
| Strategy | Code v0.2: Swing, Value/Dividend, Hybrid, kịch bản, vô hiệu hóa |
| Risk | Code v0.2: vị thế, chi phí, R:R, thanh khoản/ngành/gap, không thực thi lệnh |
| Critic / Audit | Kiểm tra hợp đồng và số liệu/citation, phản biện giá; model thật chưa chạy |
| Backtest Agent | Chưa triển khai; chỉ v0.3 khi được phép. Engine cũ giữ nguyên |
| Monitoring | Chưa triển khai; chỉ v0.3 khi được phép |

Report Engine là module renderer, không phải Agent thứ 11. Trace chỉ đánh completed khi công cụ trả kết quả; một báo cáo Chờ không có nghĩa thiếu điều kiện được biến thành thành công đầu tư.
