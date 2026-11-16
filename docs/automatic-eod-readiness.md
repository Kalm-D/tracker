# Khôi phục EOD — artifact và loader đang kiểm định

Chủ website đã cho phép tiếp tục sửa, kiểm định và phát hành. Không yêu cầu duyệt code lại. Branch này chuẩn bị hai phần độc lập có thể kiểm thử mà chưa phát hành dữ liệu thật:

- `prepare-automatic-pages.cjs` chỉ tạo artifact mới trong `work`, dựa trên snapshot đã qua publisher, audit JSON/gzip, lịch giao dịch, VNINDEX cùng phiên, độ phủ hiện hành, hash active và tối đa ba archive rollback. Chỉ copy file đã đăng ký, loại Backtest/log/CSV.
- `automatic-data.js` lấy manifest rồi snapshot bất biến cùng origin, dùng loader và engine cũ. Mở/quay lại tab hoặc bấm kiểm tra phiên mới sẽ kiểm tra cập nhật. Lỗi/hash lệch/lùi phiên giữ dữ liệu đang dùng và cập nhật cảnh báo. Không tải giá nguồn trên mỗi iPhone, không sửa/xóa Watchlist hay IndexedDB cá nhân.

Policy production vẫn là `personal-file-only`; workflow EOD hiện hành không được bật ngầm. `config/public-eod.json` đang `enabled:false`, `rights.status:pending`. Test dùng cấu hình giả được ghi rõ; không coi đó là bằng chứng quyền nguồn. Lỗi `PUBLIC_EOD_NOT_CLEARED` dừng trước mọi thao tác copy.

## Điều kiện chưa hoàn thành

1. Phạm vi dùng/phát hành KBS công khai chưa xác minh. Thư đã gửi 16/11/2026; khi kiểm tra lại chưa có trả lời. Không ghi `verified` dựa vào HTTP 200, CORS hay quyền deploy của chủ website.
2. Chưa kiểm định KBS toàn danh mục/nhiều lượt EOD độc lập. UTT vẫn trả rỗng trong lượt đã đo. Publication gate hiện tại chặn thiếu mã; branch này không thêm allowlist hoặc nới ngưỡng.
3. Chưa nối/bật scheduler → exporter → pack → publisher → Pages. Khi triển khai cần dùng chung concurrency `tracker-pages-publish` với UI, chỉ HEAD main, kiểm tra ngày giao dịch, giữ active/ba archive đã xác minh từ lần phát hành trước, không deploy nếu thiếu bất kỳ đầu vào/gate nào. UI deploy cũng phải giữ snapshot active; không để workflow UI ghi đè site EOD thành site không có dữ liệu. Không upload giá vào Git hoặc artifact chẩn đoán công khai.
4. Cần kiểm thử tích hợp lịch/publisher trên Linux và kiểm tra bản phát hành trên iPhone; test controller/parse artifact không thay kiểm thử Safari thật.

## Kiểm thử và rollback

`node --test tests/automatic-data.test.cjs`: fixture EOD cuối tuần; artifact byte giữ nguyên; không lộ Backtest/CSV; JSON/gzip lệch; archive hash sai; thiếu phiên; manifest → loader gzip; request đồng thời; network failure; manifest/path/hash sai; lùi phiên.

Chạy toàn bộ Node/Python hồi quy trước khi đưa code vào main. Công thức engine/RS/Regime/Backtest và file HTML nguồn không đổi. Branch này không chạm production nên chưa cần rollback. Khi phát hành thật, giữ artifact/commit trước và archive publisher; khôi phục cả UI và snapshot trong một artifact, không đổi Watchlist/cấu hình người dùng.

Phạm vi này là chuẩn bị kỹ thuật cho yêu cầu tự EOD; chưa phải EOD đang hoạt động, chưa phải nghiệm thu toàn bộ Master Prompt.
