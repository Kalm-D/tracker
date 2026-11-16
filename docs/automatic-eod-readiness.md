# Khôi phục EOD — artifact và loader đang kiểm định

Chủ website đã cho phép tiếp tục sửa, kiểm định và phát hành. Không yêu cầu duyệt code lại. Branch này chuẩn bị hai phần độc lập có thể kiểm thử mà chưa phát hành dữ liệu thật:

- `prepare-automatic-pages.cjs` chỉ tạo artifact mới trong `work`, dựa trên snapshot đã qua publisher, audit JSON/gzip, lịch giao dịch, VNINDEX cùng phiên, độ phủ hiện hành, hash active và tối đa ba archive rollback. Chỉ copy file đã đăng ký, loại Backtest/log/CSV.
- `automatic-data.js` lấy manifest rồi snapshot bất biến cùng origin, dùng loader và engine cũ. Mở/quay lại tab hoặc bấm kiểm tra phiên mới sẽ kiểm tra cập nhật. Lỗi/hash lệch/lùi phiên giữ dữ liệu đang dùng và cập nhật cảnh báo. Không tải giá nguồn trên mỗi iPhone, không sửa/xóa Watchlist hay IndexedDB cá nhân.

Policy production vẫn là `personal-file-only`. Lịch mới chỉ nằm trên branch review, lúc 16:17 giờ Việt Nam, Thứ Hai–Thứ Sáu; khi đưa lên main cũng không gọi nguồn hoặc deploy nếu config còn tắt. `config/public-eod.json` đang `enabled:false`, `rights.status:pending`, `bootstrapReview.status:pending`. Test dùng cấu hình giả được ghi rõ; không coi đó là bằng chứng quyền nguồn. Lỗi `PUBLIC_EOD_NOT_CLEARED` dừng trước mọi thao tác copy. GitHub có thể chạy lịch trễ; thời điểm 16:17 là giờ bắt đầu dự kiến, không phải cam kết giờ hoàn tất toàn danh mục.

## Điều kiện chưa hoàn thành

1. Phạm vi dùng/phát hành KBS công khai chưa xác minh. Thư đã gửi 16/11/2026; khi kiểm tra lại chưa có trả lời. Không ghi `verified` dựa vào HTTP 200, CORS hay quyền deploy của chủ website.
2. Chưa kiểm định KBS toàn danh mục/nhiều lượt EOD độc lập. UTT vẫn trả rỗng trong lượt đã đo. Publication gate hiện tại chặn thiếu mã; branch này không thêm allowlist hoặc nới ngưỡng.
3. Scheduler → exporter → pack → publisher → Pages đã được nối trong code review, chưa chạy EOD production. Hai workflow dùng chung concurrency `tracker-pages-publish`, chỉ HEAD main. Khôi phục active/ba archive qua Pages và xác minh hash trước khi xuất; lỗi HTTP không tự coi là bootstrap. Không upload giá vào Git/artifact chẩn đoán. Job UI khi config bật cũng giữ snapshot active. Thiếu phiên hoặc gate fail thì không deploy. Cần Linux CI, chạy thật đầu/cuối và kiểm tra iPhone trước khi xác nhận vận hành.
4. Bootstrap là thao tác tường minh `node tools/run-automatic-eod.cjs --bootstrap <candidate>`, chỉ sau khi đã kiểm định toàn danh mục và config ghi đúng hash canonical, symbolCount bằng attempted, kèm tham chiếu kiểm định. Không dùng tập 5 mã đối chứng làm bootstrap toàn thị trường. Mã ngắn lịch sử/không tải được vẫn có thể làm strict exporter từ chối; không nới gate ngầm để job xanh.

## Đường vận hành đã chuẩn bị

`--plan` kiểm tra gate/lịch, không gọi HTTP. `--publish` lấy snapshot cũ đã xác minh, xuất toàn danh mục KBS với 320 phiên, pack không quarantine và publish không allowlist. Sau đó build nguyên artifact Pages, chỉ deploy nếu HEAD không thay trong lúc job chạy. `--ui-only` dùng nguyên chế độ cá nhân khi config tắt; khi bật phải khôi phục bản snapshot hợp lệ. `--bootstrap` không tự chạy từ cron hoặc khi URL cũ 404.

## Kiểm thử và rollback

`node --test tests/automatic-data.test.cjs`: fixture EOD cuối tuần; artifact byte giữ nguyên; không lộ Backtest/CSV; JSON/gzip lệch; archive hash sai; thiếu phiên; manifest → loader gzip; request đồng thời; network failure; manifest/path/hash sai; lùi phiên.

Chạy toàn bộ Node/Python hồi quy trước khi đưa code vào main. Công thức engine/RS/Regime/Backtest và file HTML nguồn không đổi. Branch này không chạm production nên chưa cần rollback. Khi phát hành thật, giữ artifact/commit trước và archive publisher; khôi phục cả UI và snapshot trong một artifact, không đổi Watchlist/cấu hình người dùng.

Phạm vi này là chuẩn bị kỹ thuật cho yêu cầu tự EOD; chưa phải EOD đang hoạt động, chưa phải nghiệm thu toàn bộ Master Prompt.
