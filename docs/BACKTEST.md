# Backtest v1 — vận hành và giới hạn

Phạm vi cập nhật 15/10/2026: người dùng yêu cầu bỏ phần tài khoản, ưu tiên Backtest. Không triển khai Supabase, đăng nhập, quản lý chủ sở hữu hoặc đồng bộ cá nhân. Backtest trên Pages là công khai. Runner dùng token riêng cho một người vận hành, không phải hệ thống vai trò/admin.

## Đã kiểm tra trước khi sửa

Baseline: `007e5c36cacb56cf0afa9a0540c8271cd5d72986`. Repo public, giao diện HTML/JS trong `public/`; hai workflow GitHub Pages triển khai cùng thư mục. Workflow dữ liệu tải khoảng 320 phiên từ Vnstock/KBS rồi commit snapshot. Alpha Stock cũng đọc snapshot này: không thay schema/file dữ liệu hiện hành.

- `market.json.gz`: 1.520 mã/chỉ số, 354.054 bar nguồn, 335 bar sai OHLCV bị loại khi Backtest, còn 353.719. Có dữ liệu rời rạc từ 31/03/2023 nhưng không phải một chuỗi 3 năm đầy đủ cho mọi mã.
- VNINDEX: 320 phiên từ 04/07/2025 đến 15/10/2026; chưa có VN30. 800 mã có 320 dòng trước validation.
- `market.json`: DEMO, 3 mã/chỉ số, 690 dòng. Runner và tab mới từ chối. Không fallback sang demo khi GZ lỗi.
- Khoảng chạy hỗ trợ của snapshot kiểm tra: 10/07/2026–15/10/2026, sau 252 phiên warm-up + pivot đã biết. Mỗi cổ phiếu cũng phải có ít nhất 252 bar hợp lệ để làm ứng viên.
- Chưa có bằng chứng nguồn điều chỉnh giá, chia tách/cổ tức, lịch sử thành phần chỉ số, niêm yết/hủy niêm yết, hạn chế giao dịch và sổ lệnh. Vì thế kết quả luôn gắn nhãn nghiên cứu có giới hạn, không phải hiệu suất thật/tổng lợi nhuận.

## Cách dùng

1. Trên máy tính chọn **Backtest**. Điện thoại: **Thêm → Backtest**.
2. Kiểm tra nguồn, hash, khoảng dữ liệu; chọn khoảng lịch sử hoặc **Chu kỳ hiện tại**. Chu kỳ là đoạn liên tiếp cùng nhãn Market Regime, không phải chu kỳ kinh tế. Đầu đoạn có thể bị giới hạn bởi độ dài snapshot.
3. Chọn sàn/tập mã, chỉ số và chạy riêng/so sánh hai phương pháp. Thay cấu hình Screener trước nếu cần ngưỡng thanh khoản, RS hoặc nền giá khác. Những giá trị đó được đóng băng vào kết quả khi chạy.
4. Kiểm tra preset đã được người dùng chọn: lệnh chờ pivot, 100 triệu VND, 5 vị thế, 20%/mã, chia đều, stop Tracker, 2R, phí 0,15%/chiều, thuế bán 0,1%, trượt giá 0,1%/chiều. Không có đòn bẩy.
5. Đọc giả định và đánh dấu xác nhận. Tham gia thanh khoản 1%, cooldown 5 phiên, T+3 khả dụng là các giả định hiển thị của bản nghiên cứu; không được diễn giải là khớp giao dịch thực.
6. **Chạy Backtest**. Có thể chuyển sang tab nghiên cứu trong lúc chạy; nếu dùng chế độ trình duyệt phải giữ trang mở. Giới hạn chế độ này: khoảng lịch ≤180 ngày, ≤600.000 bar. Tác vụ dài dùng runner.
7. Lưu JSON kết quả, CSV giao dịch và snapshot. IndexedDB chỉ lưu kết quả trên thiết bị, không thay thế sao lưu. Không lưu token runner vào browser storage.

## Công thức và quy tắc

`public/shared/tracker-engine.js` là 28 hàm được tách từ baseline, giữ nguyên phép tính và ngưỡng. Ba hàm nhận input tường minh (`computeMetrics`, `deriveVolumeScore`, `applyCompositeScores`) thay vì đọc DOM/global state. Giao diện cũ dùng wrapper với input cũ. Bài test chạy hàm gốc lấy từ Git ở ba ngày lịch sử và so toàn bộ metrics/regime với bản tách.

`candidates-1.0.0` là tổ hợp quy tắc MỚI, không khẳng định bản cũ đã có chiến lược danh mục này:

- Cả hai: D0, đủ warm-up, pivot/stop hợp lệ, không Avoid/phân phối.
- Thị trường: liquidity pass, Market Fit ≥70, Tracker ≥55, Risk ≥70, Setup ≥40, không mua trong UNKNOWN/DOWNTREND/CAPITULATION/DISTRIBUTION; gần pivot theo ngưỡng Screener.
- Cá nhân: tùy chọn thanh khoản/Leader/Base, RS/Tracker/Risk tối thiểu, risk% tối đa. Tất cả điều kiện kết hợp AND.
- Không lấy Watchlist/danh sách đạt hôm nay để áp ngược. Mỗi ngày cắt chuỗi ở thời điểm được phép, tính lại cross-sectional RS, breadth, regime, setup, điểm số, pivot, stop. Universe dùng dữ liệu hiện có đến ngày đó; vẫn thiếu lịch sử mã đã rời thị trường.
- RS/breadth tính trước khi lọc tập mã/sàn để không làm thay đổi điểm do chọn vài mã để giao dịch. Chỉ dùng thanh khoản/giá của quá khứ để chọn và xếp hạng.

### Trình tự khớp

Lệnh pivot: ứng viên có close ≤pivot tại D-1; đặt buy-stop có hiệu lực trong D. High D chưa chạm: không mua. Gap qua pivot: mua tại open D. Không dùng volume cuối ngày D để xác nhận trước giờ mở cửa. Lệnh close: setup/pivot tại D-2, close D-1 vượt pivot, mua sớm nhất open D. Close confirmation bản này không bắt buộc bùng nổ volume; không dùng nhãn gần pivot thay cho xác nhận đóng cửa.

Stop lưu từ setup, giữ cố định tại entry; nếu giá mở cửa ≤stop thì bỏ mua. Target = giá khớp + R × khoảng cách stop hoặc giá khớp × (1 + target%). Trailing chỉ nâng từ close đã biết, có hiệu lực phiên sau; không dùng high cuối ngày để thoát sớm hơn cùng ngày.

T+2 hoàn tất trong ngày không đủ chi tiết OHLC để xác định thời điểm được bán. Bản này chỉ cho dùng tiền/cổ phiếu từ **đầu T+3**, một giả định bảo thủ về khả dụng, không phải tuyên bố lợi nhuận luôn thấp hơn thực tế. Stop chạm khi cổ phiếu chưa khả dụng được ghi pending và bán tại open phiên đủ điều kiện đầu tiên. Nếu daily low trên ngày mua có thể xảy ra trước entry, vẫn coi stop đã chạm theo giả định bất lợi. Target chạm khi chưa khả dụng không đảm bảo bán được; chỉ xét lại từ phiên khả dụng.

Hai mức stop/target cùng chạm: stop trước. Gap dưới stop: open; gap trên target: chỉ ghi target. Không mua/bán bar thiếu, volume 0 hoặc một giá. Không có dữ liệu trần/sàn nên các bar khác vẫn chỉ là xấp xỉ. Không khẳng định giải quyết được mọi trường hợp không khớp/hạn chế giao dịch.

KL = lô 100, bị chặn bởi vốn sau chi phí, giới hạn vị thế/tỷ trọng và min(TB20 đã biết, volume ngày khớp) × participation. Volume thực hiện của ngày chỉ được dùng như trần khớp lệnh hậu kiểm, không chọn tín hiệu/xếp hạng; đây không phải mô hình sổ lệnh. Phần mua không khớp bị hủy cuối ngày. Stop bán một phần được giữ pending, lần sau bán tại open khi khớp được. Không cộng thêm vị thế cùng mã; sau khi đóng phải qua cooldown. Đồng điểm dùng thứ tự mã để tái lập.

Phí + thuế bán + trượt giá ghi thành chi phí tiền riêng. Giá khớp gốc vẫn là OHLC/pivot/stop; không làm sai OHLC để nhét trượt giá. Các tỷ lệ là giả định, chưa tự đổi theo lịch sử broker. Chưa hỗ trợ quy định trước 29/08/2022: từ chối chạy giai đoạn đó.

NAV = tiền dùng được + tiền bán chờ về + số cổ phiếu còn giữ × close gần nhất. Giá trị còn giữ không tự trừ chi phí thoát chưa phát sinh. Realized chỉ phát sinh trên lượng đã bán, phân bổ phí mua theo số cổ phiếu; unrealized tính trên số còn lại. Các lần bán một phần có trong `exits` của mỗi vị thế. Bảng theo mã cộng lãi/lỗ tiền, không lấy trung bình return các mã làm lợi nhuận danh mục.

Mốc so sánh chung: đóng cửa phiên trước ngày giao dịch đầu tiên = vốn ban đầu. VNINDEX/VN30 chỉ so nếu có đủ close đúng các ngày chạy; không nội suy. Chỉ số giá không phải sản phẩm giao dịch trực tiếp. CAGR chỉ báo khi ≥365 ngày; win rate dùng vị thế đóng hết; drawdown tính từ đỉnh NAV gồm vốn gốc. Regime trước phiên gắn vào NAV, regime setup gắn vào tín hiệu. Mẫu nhỏ chỉ mô tả.

## Runner bền vững

Không có dịch vụ trả phí được đăng ký. Node >=22, không có dependency runtime ngoài thư viện chuẩn:

```sh
node --test tests/*.test.cjs
node tools/check-scripts.cjs
node tools/audit-data.cjs
node server/server.cjs
```

Cấu hình môi trường qua secret manager/service manager của máy chủ do bạn quản lý:

| Biến | Ý nghĩa |
|---|---|
| `TRACKER_RUNNER_TOKEN` | Chuỗi ngẫu nhiên ≥32 ký tự, chỉ cho runner; không dùng khóa Supabase/GitHub |
| `TRACKER_ALLOWED_ORIGIN` | `https://kalm-d.github.io` khi kết nối Pages; một origin chính xác |
| `TRACKER_HOST` | Mặc định `127.0.0.1`; đặt sau reverse proxy HTTPS khi truy cập từ xa |
| `PORT` | Mặc định 8787 |
| `TRACKER_DATA_FILE` | File snapshot thật, mặc định `public/data/market.json.gz` |
| `TRACKER_JOBS_DIR` | Thư mục riêng, mặc định `.backtest-jobs`, tuyệt đối không đặt trong public |
| `TRACKER_MAX_RUN_MS` | Timeout mỗi job, mặc định 30 phút |

Token là chìa khóa chung dành cho người vận hành runner, không phân biệt từng người. Ai có token đọc được mọi kết quả trên runner. Không phù hợp một dịch vụ nhiều người dùng riêng tư. Xoay token và khởi động lại để thu hồi; không ghi Authorization/request body vào logs proxy. CORS không thay thế xác thực.

Chỉ một process runner dùng một thư mục job. Một worker thread/job, 1 job đang chạy, tối đa 3 queued/running và 100 job được giữ. Snapshot được sao chép vào từng job; metadata/result ghi atomic rename. Khởi động lại: job đang chạy chuyển về queued và tính lại từ đầu với snapshot cũ. Ghi version/hash/config/assumptions; không tự lấy snapshot mới cho job đã xếp hàng. Máy chủ và trình duyệt phải có cùng SHA-256 của JSON.parse → JSON.stringify UTF-8; từ chối HTTP 409 nếu khác. Không hỗ trợ cluster nhiều runner chung ổ đĩa.

`DELETE /api/jobs/:id` hủy queued/running. `GET /api/jobs/:id` trả trạng thái; `GET /api/jobs/:id/result` chỉ trả completed. Tất cả API cần bearer token, kể cả đọc kết quả. Máy chủ hoàn tất job khi đóng tab, giữ mã job để kết nối lại. Worker restart/timeout không phụ thuộc UI.

Dockerfile là tùy chọn: build từ gốc repo bằng `docker build -f server/Dockerfile -t tracker-runner .`. Mount `/data` do UID node được ghi, đặt snapshot `/data/market.json.gz`, truyền secrets bằng hệ thống triển khai. Docker chưa được chạy trong môi trường bàn giao này. Remote HTTPS/persistent volume chưa được cấp hoặc cấu hình; đây là phần triển khai còn chờ.

## Tái lập và ngoài mẫu

```sh
node tools/run-backtest.cjs snapshot.json.gz saved-result.json replay-result.json
```

CLI dùng `config` + `settings` từ kết quả trước. Snapshot tải từ tab là JSON; CLI nhận cả JSON/GZ. Giữ cả commit nguồn ứng dụng vì version text không chứa nội dung code. Kết quả deterministic không gồm thời gian chạy; worker thêm `createdAt` ngoài phép tính. Không dùng demo/synthetic fixture trong báo cáo lợi nhuận thật.

Giữ riêng giai đoạn chọn tham số và kiểm định ngoài mẫu, khóa cấu hình trước khi chạy phần sau; không chọn preset bằng return đẹp nhất. Với snapshot ~3 tháng chạy được, chưa thể có kiểm định đủ nhiều regime/5–10 năm. Muốn mở rộng cần nguồn lịch sử có quyền sử dụng, chuỗi OHLC/corporate action nhất quán, lịch niêm yết/hủy niêm yết và lịch giao dịch/giới hạn theo thời kỳ. Exporter hiện hữu có `--sessions`/`--calendar-days`; tăng số phiên không tự giải quyết thiếu mã hủy niêm yết hoặc adjustment. Không tự mua dữ liệu.

## Chi phí và phần còn chờ

Pages giữ hosting hiện có; JS chạy trên thiết bị người dùng, không thêm phí dịch vụ mới. Runner chạy máy sẵn có: không phí thuê mới, vẫn tiêu thụ điện/CPU/RAM/đĩa; nếu muốn máy chủ 24/7 cần lựa chọn hosting, persistent disk và ngân sách trước. Không hứa gói miễn phí nào đủ tải hoặc uptime. Mỗi job lưu một snapshot nén (~3,4 MB tại thời điểm kiểm tra) và JSON kết quả; 100 job ít nhất ~340 MB snapshot, chưa kể results. Không dùng email/Supabase ở giai đoạn này.

Chưa hoàn thành: hosting remote của runner, dữ liệu 5–10 năm/VN30/corporate actions/universe đầy đủ, mô phỏng intraday/sổ lệnh/hạn chế từng phiên, xác minh ngoài mẫu dài hạn. Tài khoản/admin/khôi phục/đồng bộ cá nhân nằm ngoài phạm vi hiện tại theo yêu cầu mới.

## Nguồn đối chiếu

- [GitHub Pages là hosting tĩnh](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).
- [VSDC: thay đổi thời gian hoàn tất thanh toán từ 29/08/2022](https://vsdc.vn/vi/ad/152750).
- [Ủy ban Chứng khoán: lô chẵn HOSE 100 cổ phiếu từ 2021](https://ssc.gov.vn/webcenter/portal/ubck/pages_r/l/chitit?dDocName=APPSSCGOVVN162136981).

Các nguồn trên không xác nhận đầy đủ mọi quy tắc năm 2026/từng sàn. Bản v1 công bố mô hình xấp xỉ và chặn giai đoạn chưa hỗ trợ.
