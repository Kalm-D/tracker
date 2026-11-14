# Token, quota và Free Mode — v1.0 RC

STRICT_FREE_MODE=true, ALLOW_PAID_API=false, ALLOW_AUTOTRADING=false. Giá trị cấu hình không hợp lệ hoặc cho phép paid/tắt strict sẽ chặn provider. Cờ ứng dụng không thể vô hiệu hóa billing trong tài khoản đã bị cấu hình sai; quản trị phải kiểm tra trực tiếp tài khoản.

Không hardcode tên model. Cần chọn model thực có trong tài khoản, xác nhận điều kiện free-tier và đặt cờ *_FREE_TIER_CONFIRMED. Gateway kiểm tra danh mục model trước generation, cache danh mục 15 phút. Có tên trong danh mục không chứng minh miễn phí.

## Trần nội bộ và sổ bền

Mặc định tổng 30 generation attempt/ngày UTC, 60.000 token giữ chỗ/charged. Mỗi provider có trần nội bộ RPM 5, TPM 60.000, RPD 30, TPD 60.000. Các con số này không phải hạn mức nhà cung cấp và có thể cao hơn quota tài khoản; phải giảm theo tài khoản thực. Biến cấu hình ở .env.example.

RPM/TPM dùng cửa sổ 60 giây; RPD/TPD của provider dùng 24 giờ trượt, gộp mọi model của provider để đổi model không tạo ngân sách mới. Tổng ngày dùng UTC. Không giả lập thời điểm reset của nhà cung cấp: Gemini và Groq có phạm vi/reset riêng. Sổ này chỉ biết các call qua backend này; call từ app hoặc máy khác không được tính.

gateway/usage.json schema 1 được giữ khóa, nạp lại và ghi nguyên tử trước generation POST. Một thư mục chỉ có một runtime. Sổ cũ được migrate với số đã dùng giữ nguyên và quy nguồn chưa rõ theo hướng thận trọng. File hỏng, array/null, schema/cấu hình sai, lock hoặc lỗi ghi đều chặn call; không reset ngân sách ngầm.

Giữ chỗ bằng số byte UTF-8 của system prompt và evidence tinh gọn cộng trần đầu ra 700/1.400/2.200 theo mode. Đây là heuristic, không phải tokenizer hoặc bảo đảm trần token của provider. Input bị giới hạn 100.000 byte UTF-8. Lỗi/timeout không hoàn lại giữ chỗ. Nếu actual total lớn hơn giữ chỗ, phần vượt được cộng vào charged budget.

Chỉ ghi input/output/reasoning/total khi usage hợp lệ được provider báo; thiếu usage được đánh unknown. Không tự suy ra phần reasoning thiếu. Bộ đếm usage chỉ là usage đã quan sát, không phải hóa đơn. Lời gọi danh mục model không nằm trong bộ đếm generation attempt.

## Retry, cooldown và cache

AI_MAX_RETRIES mặc định 0, cho phép 0–2. Mỗi retry giữ chỗ riêng, chỉ retry lỗi tạm thời phù hợp; hủy từ người dùng dừng retry/fallback. Backoff ngắn có giới hạn; Retry-After dài chuyển sang fallback đủ điều kiện. 429 tạo cooldown, tối thiểu mặc định 60 giây nếu không có header hợp lệ. Không retry vòng kín.

AI_ROUTE_<ROLE> chọn thứ tự Gemini/Groq; Critic mặc định ưu tiên Groq, vai trò khác Gemini. Fallback chỉ dùng provider đã cấu hình và xác nhận free. Không tự chọn model trả phí.

Cache generation 6 giờ theo câu hỏi/nguồn/vai trò/mode/version/model, tối đa 100 tệp; dữ liệu nguồn có cache riêng. Cache hit không gọi provider. Không gửi toàn bộ OHLCV hoặc lịch sử chat cho mọi vai trò; thông tin vốn/vị thế cá nhân bị loại khỏi evidence model theo hợp đồng.

Headers chỉ được giữ dưới dạng số an toàn hoặc thời điểm cooldown. Groq remaining-requests là RPD, remaining-tokens là TPM; đây là quan sát tại một thời điểm, không là quota tổng quát hiện tại. UI luôn tách trần nội bộ, usage đã ghi và quota tài khoản chưa xác minh.

Restore sổ từ backup tạo marker chặn generation 24 giờ vì có thể thiếu call sau lúc backup. Không xóa marker, sổ hoặc khóa để vượt quota. Xem OPERATIONS.md.

## Nguồn và nghiệm thu

Đã đối chiếu ngày 26/10/2026:
- https://ai.google.dev/gemini-api/docs/rate-limits
- https://ai.google.dev/gemini-api/docs/tokens
- https://console.groq.com/docs/rate-limits

Test hiện dùng provider giả lập có nhãn. 0 call model thật/0 usage provider ghi nhận trong phiên triển khai. Token ChatGPT Work chưa có số đo. Chưa kiểm tra billing hoặc quota tài khoản thật.
