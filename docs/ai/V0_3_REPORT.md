# Báo cáo v0.3 — Backtest & Monitoring

Ngày 26/10/2026. Trạng thái: **Partial / bản thử nghiệm cục bộ**. Người dùng đã cho phép tiếp tục v0.3. Các phần model API, BCTC chuẩn hóa và cloud còn thiếu từ v0.1/v0.2 tiếp tục được ghi nhận; không nâng thành nghiệm thu toàn hệ thống.

## Kết quả triển khai

- Backtest Agent dùng trực tiếp engine cũ, chạy worker có timeout/hủy, tối đa 60 phiên và 1–5 mã. Không thay công thức hoặc data gốc.
- Cấu hình có xác nhận giới hạn; hash nguồn/cấu hình; so sánh market/personal, chỉ số VNINDEX, phân đoạn ngoài mẫu theo mốc chọn, chi phí, đường vốn/giao dịch và JSON tải về.
- Monitoring lưu mốc từ báo cáo, mức giá có nguồn, các thay đổi close/MA50/market regime/chất lượng dữ liệu, chống lặp, sửa cùng ngày và dữ liệu quay lùi.
- Lưu/tạm dừng/tiếp tục/xóa monitor; kiểm tra định kỳ file snapshot khi máy chủ còn chạy; khôi phục cấu hình đã bật sau restart. Cảnh báo trong ứng dụng, không có email/push hay cloud scheduler.
- API cùng owner auth/CSRF/Origin và lịch sử; thông tin vốn/danh mục được loại khỏi evidence Backtest gửi model. Public feature flag vẫn false.

Xem BACKTEST_MONITORING.md cho hợp đồng kỹ thuật và giới hạn chi tiết.

## Kiểm chứng

Bộ kiểm thử gồm 63 test hiện hữu và 18 test mới, tổng **81/81 PASS**, 0 thất bại. Kiểm tra 24 script parse, git diff --check và audit dữ liệu cũng đạt; audit giữ nguyên 315 bar bị loại trên snapshot thật. Các test mới đối chiếu toàn bộ output worker với engine trực tiếp trên snapshot thật và toàn universe; kiểm tra snapshot đổi giữa tác vụ, demo, thiếu warmup/mã/benchmark, timeout/hủy, tách phương pháp, history, giới hạn input, lọc dữ liệu vốn, monitor persistence/crossing/dedup/revision/older/missing/paused/deleted/source error/retention/shutdown, cùng API owner/CSRF.

UI thực: Backtest MBB/ACB trên dữ liệu 23/10/2026, kỳ 01–23/10, vốn mô phỏng 100 triệu, hai phương pháp đều 0 giao dịch; UI ghi rõ tỷ lệ thắng chưa có và không diễn giải 0% thành hiệu quả. VNINDEX lợi nhuận giá 0,31%, sụt giảm 4,45%; VN30 thiếu dữ liệu và được ghi thiếu. Đây chỉ là phép thử tính năng trong kỳ đã chọn, không phải nghiên cứu hiệu quả đầu tư hay khuyến nghị.

Đã mở lại kết quả từ lịch sử sau restart, tạo monitor từ báo cáo thật, kiểm tra snapshot chưa đổi và thử tạm dừng. Dữ liệu chưa có phiên mới nên không có cảnh báo thị trường thật được ghi nhận; các tình huống giá giao cắt được kiểm tra bằng fixture có nhãn test. Kiểm tra desktop và khung 390×844: form cuộn, các vùng không tràn ngang. Chưa nghiệm thu Safari/iPhone vật lý hoặc bàn phím ảo.

## Giới hạn nghiệm thu

Backtest chỉ kiểm định hai bộ lọc kỹ thuật engine gốc, chưa có Value/Dividend/Hybrid hồi tố hoặc chuỗi tài chính point-in-time. Nguồn có thiên lệch sống sót, điều chỉnh/cổ tức chưa xác nhận. Không tối ưu tham số; phân đoạn ngoài mẫu do người dùng chọn.

Monitoring chỉ hoạt động khi máy chủ hiện tại chạy và file snapshot được cập nhật từ nguồn ngoài. Không cloud 24/7, không backfill phiên bỏ lỡ, không intraday, không tự tải giá, không email/push. Hệ thống vẫn một owner.

Model API thật: 0 call, 0 token provider ghi nhận; không phát sinh phí model API. Các vai trò mới đã chạy code, chưa có hai model Backtest/Monitoring được nghiệm thu. Fundamental/BCTC thật và cloud vẫn chưa hoàn tất. Chưa merge main/deploy website chính thức, chưa bắt đầu v0.4.

## Bàn giao

Nhánh cục bộ feature/tracker-ai-v0.3, nền v0.2 3783e35760174a2d456e8ffa7d161800aadee56b. Bản xem thử: http://127.0.0.1:8793/ trên máy hiện tại, chỉ khả dụng khi tiến trình đang chạy. Khởi động bền qua tools/setup-ai.cjs theo DEPLOYMENT.md, không dùng mật khẩu test cho môi trường thật.

v0.2 đã công khai ở PR nháp #12: https://github.com/Kalm-D/tracker/pull/12, CI cuối v0.2 PASS trên commit 3783e357: https://github.com/Kalm-D/tracker/actions/runs/40278418597. PR này xếp trên v0.1 #11. Chưa công khai v0.3 tại thời điểm viết báo cáo; không có kết quả GitHub CI v0.3 để suy diễn từ kết quả cục bộ.

Commit code cục bộ v0.3: af27e006022f59dd53a22c638d2cc289ce9ea44a (21 tệp so với nền v0.2), chưa tải lên GitHub. 81/81 PASS là kết quả cục bộ, không phải GitHub CI v0.3.
