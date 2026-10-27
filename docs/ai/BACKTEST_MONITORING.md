# v0.3 — Backtest và Monitoring

Phạm vi được người dùng cho phép ngày 26/10/2026: công khai v0.2, tiếp tục v0.3. Trạng thái nghiệm thu tổng thể vẫn Partial do thiếu model/BCTC/cloud thật.

## Backtest Agent

Dùng nguyên public/backtest/engine.js và public/shared/tracker-engine.js. Không sửa công thức. Tính RS/breadth trên toàn universe trước khi lọc mã. Công cụ chạy bằng worker riêng; một research job hoạt động và tối đa ba job trong hàng đợi như v0.1. Timeout worker 120 giây, hủy bằng AbortSignal và terminate, giới hạn old generation 512 MB. Đây là giới hạn V8, không phải giới hạn tổng RAM của hệ điều hành.

Cấu hình riêng trong request.backtest với ngày bắt đầu/kết thúc, vốn mô phỏng, xác nhận giới hạn, phương pháp market/personal/both; tùy chọn mốc ngoài mẫu, phí/thuế/trượt giá và các tham số whitelist. Không nhận warmup, settlement, ticker hoặc settings tùy ý từ client. Ticker lấy từ Router, 1–5 mã. Tối đa 60 phiên trong kỳ và 20 vị thế. Benchmark VNINDEX, làm nóng 252 phiên, lô 100, quy ước T+3 của engine. Không tự chọn khoảng thời gian hoặc vốn và không suy diễn ngày từ câu hỏi.

Hai bộ lọc market/personal là các quy tắc kỹ thuật đã có trong engine. Đây chưa phải kiểm định Value/Dividend/Hybrid của v0.2. Request trộn Backtest và Strategy bị từ chối để tránh gán kết quả sai phương pháp. Phân đoạn ngoài mẫu là theo mốc người dùng chọn; không có tối ưu hay bảo đảm dữ liệu đó chưa từng được dùng để chọn tham số.

Snapshot được kiểm tra hash lần nữa trong worker để phát hiện dữ liệu đổi giữa các bước. Nguồn demo, thiếu benchmark, thiếu warmup, khoảng ngày không được hỗ trợ, mã không có, cấu hình sai đều bị chặn. Báo cáo lưu engine/rule/calculation version, hash nguồn và hash cấu hình, cấu hình đầy đủ, audit nguồn, đường vốn, giao dịch, lãi/lỗ đã/chưa thực hiện, chi phí, trạng thái tín hiệu, so sánh chỉ số và giới hạn. VN30 thiếu thì ghi thiếu; không tự tổng hợp.

Phép khớp/chi phí của Backtest giữ nguyên engine cũ, khác phép sizing tham chiếu của Risk v0.2: không bổ sung làm tròn bước giá trong simulator hoặc coi hai phép tính tương đương. Các ngoại lệ giao dịch/chuỗi điều chỉnh/cổ tức chưa được chứng nhận; không phải tổng lợi nhuận. Chưa có lịch sử mã đã rời thị trường, có thiên lệch sống sót. Không dùng kết quả để tạo lệnh. Báo cáo không giao dịch ghi rõ 0 giao dịch và tỷ lệ thắng chưa có.

UI: mở chat AI, nhập mã/câu hỏi, mở Backtest, chọn khoảng ngày/vốn/phí, đánh dấu xác nhận. Quick chạy code không cần model. Standard/Deep còn phụ thuộc model được cấu hình. Có thể tải JSON và mở lại lịch sử. Khi thử lại giữ cấu hình đã lưu, kể cả trường API chưa có ô nhập riêng.

## Monitoring

Owner chủ động chọn Theo dõi báo cáo sau một research job completed hoặc blocked có bằng chứng kỹ thuật. Không tạo monitor từ job dở, thất bại hay đã hủy. Tối đa 20 bộ, mỗi bộ tối đa 5 mã. Trùng job trả lại bộ đã có. Lưu nguồn/ngày/hash cơ sở, checkpoint, giá/chỉ báo, mốc entry/stop/target và xuất xứ từng mốc từ Strategy nếu có. Chỉ có Technical thì vẫn theo dõi MA50, chất lượng dữ liệu và market regime; không bịa giá mục tiêu.

Máy chủ kiểm tra file snapshot mỗi 60 giây khi feature flag bật và tiến trình còn chạy; dùng chung một lần đọc cho các monitor bật. Nút kiểm tra chỉ chạy các bộ đang bật. Sau restart tiếp tục bộ đã bật; không phát lại diễn biến các phiên đã bỏ lỡ. Công cụ không tải giá mới, không gửi email/push và không gọi LLM. Các cảnh báo xuất hiện khi người dùng mở màn hình Theo dõi. Không có thông báo hệ điều hành hay browser permission.

So sánh close giữa các snapshot đã quan sát với mốc cố định để phát hiện giao cắt entry/stop/target; MA50 dùng đường MA50 ở từng mốc. Ghi thay đổi dataQuality/regime. Chỉ so giá khi cả hai mốc D0 và có số liệu. Thiếu hoặc stale thì báo chất lượng, không nối xuyên đoạn thiếu để tạo giao cắt. Không phát hiện giá chạm trong phiên, không coi đó là lệnh đã khớp hay đã thoát.

Hash không đổi: không thêm sự kiện. Ngày cũ hơn: không lùi checkpoint. Nguồn sửa cùng ngày: đặt lại checkpoint và ghi snapshot_revision, không coi đó là giao cắt theo thời gian. ID sự kiện phụ thuộc monitor/hash/ticker/type/version. Giữ 200 sự kiện mỗi bộ và số lượng đã loại; UI hiện 30 gần nhất. Các sự kiện vẫn có ngày nguồn và hash. Có tạm dừng/tiếp tục/xóa; tạm dừng/xóa lúc đang đọc nguồn được tôn trọng khi kết quả về.

Dữ liệu ghi nguyên tử vào TRACKER_AI_JOBS_DIR/monitoring/monitors.json, cùng khu vực riêng với lịch sử/gateway, nằm ngoài public và bị gitignore. API dùng lại cookie owner, CSRF, exact Origin và giới hạn request. Đây vẫn là chế độ một owner, chưa có phân quyền nhiều tài khoản hoặc đồng bộ thiết bị. File hỏng/khác schema không bị âm thầm xóa; cần kiểm tra bản lưu trước khi khởi động.

## API

- POST /api/ai/jobs: thêm backtest trong request để chạy. schemaVersion 3 chỉ cho tác vụ Backtest; schema v1/v2 cũ vẫn đọc được.
- GET /api/ai/monitors: cấu hình chạy/giới hạn và danh sách bộ theo dõi của owner.
- POST /api/ai/monitors: {jobId} từ báo cáo đã lưu.
- POST /api/ai/monitors/check: kiểm tra các bộ đang bật.
- POST /api/ai/monitors/:id: {enabled: true|false}.
- DELETE /api/ai/monitors/:id: xóa bộ theo dõi và sự kiện của bộ đó.

Thông tin vốn, quantities, cash, lãi/lỗ tiền và holdings không được đưa từ evidence Backtest vào model. Chỉ gửi tỷ lệ kết quả, số giao dịch, giới hạn và kỳ thử. Câu hỏi do người dùng nhập vẫn có thể gửi theo luồng model khi chọn Standard/Deep; không nhập bí mật vào câu hỏi.
