# Đăng ký vai trò Agent

Các vai trò là module trong sản phẩm; không có nghĩa đã gọi 10 model hoặc chạy 10 tác nhân phát triển.

| Vai trò | v0.1 | Thực thi |
|---|---|---|
| Manager | Đã có | Router bằng code, chọn đúng phạm vi; không gọi hết vai trò |
| Data | Đã chạy thật | Snapshot thật, hash, audit; demo bị chặn |
| Technical | Đã chạy thật | Engine cũ qua Node Worker; diễn giải LLM nếu đã cấu hình |
| Fundamental | Đã viết, kết nối chưa đạt | Adapter BCTC Vnstock và tài liệu chính thức; thử ACB bị chặn bởi môi trường SDK |
| News | Công cụ đã chạy | RSS phát hiện tin, đọc công bố HTML/PDF; chưa có phân tích model thật |
| Strategy | Chưa triển khai | Chỉ v0.2 sau phê duyệt |
| Risk | Chưa triển khai | Chỉ v0.2 sau phê duyệt |
| Backtest | Chưa triển khai Agent | Engine cũ được giữ nguyên, chỉ dùng snapshot kỹ thuật trong v0.1 |
| Critic / Audit | Kiểm tra code đã chạy | Phát hiện giá cố tình sai, nguồn/number contract; phản biện LLM chưa chạy |
| Monitoring | Chưa triển khai | Chỉ v0.3 sau phê duyệt |

Report Engine là renderer có cấu trúc bằng code. Không tạo Agent thứ 11. Trace chỉ đánh completed sau khi công cụ trả kết quả; failed/blocked không được biến thành completed.
