# Token, quota và Free Mode

Mặc định STRICT_FREE_MODE=true, ALLOW_PAID_API=false, ALLOW_AUTOTRADING=false. Nếu cấu hình bật paid hoặc tắt strict, Gateway từ chối provider. Không mua credit, không tự bật billing.

Model không được hardcode theo tên trong master prompt. Quản trị phải chọn model có trong tài khoản, xác nhận dự án chưa bật billing và cấu hình GEMINI_MODEL/GROQ_MODEL cùng cờ FREE_TIER_CONFIRMED. Gateway truy vấn danh mục API trước lời gọi sinh nội dung. Danh mục model không chứng minh model miễn phí; cờ xác nhận vẫn đòi hỏi kiểm tra tài khoản và bảng giá.

Tham chiếu đã xem ngày 26/10/2026:
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/rate-limits
- https://ai.google.dev/gemini-api/docs/generate-content/structured-output

Giới hạn nội bộ mặc định: 30 lời gọi/ngày UTC, 60.000 token ước tính được giữ chỗ. Giữ chỗ trước API; lỗi/timeout không hoàn lại ước tính để tránh lặp vô hạn. Số thực tế chỉ tăng khi provider trả usage. Ước tính dùng ký tự/2 cộng trần đầu ra; đây không phải tokenizer của provider.

Quick ưu tiên code; Standard/Deep tăng mức diễn giải và trần đầu ra 700/1.400/2.200 token mỗi call. Mỗi vai trò tối đa một call mỗi provider, không retry vòng kín. Khi 429/lỗi, chỉ fallback sang provider khác đã cấu hình free. Chưa có bộ điều khiển RPM/TPM theo quota từng tài khoản; quota thực còn lại được hiển thị unknown. Đây là phần cần hoàn thiện trước nghiệm thu.

Cache theo câu hỏi, vai trò, mode, nội dung nguồn, version và danh sách model, TTL 6 giờ. Cache nguồn tài chính/tài liệu 1 giờ trong tiến trình. Không gửi OHLCV từng bar hoặc lịch sử chat đầy đủ cho mọi agent.

Kết quả phiên triển khai: 0 lời gọi model thật, 0 token provider ghi nhận, 0 chi phí API model phát sinh. Token/hạn mức của ChatGPT Work không có API đo trong phiên; không suy diễn thành 0.
