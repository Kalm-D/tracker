# Tracker — bổ sung 2: thu gọn và lớp giải thích

Bản thử: `Tracker_v4_Help.html`. Chỉ bổ sung `collapseLayout`/`collapseLayoutScript` và `trackerHelp`/`trackerHelpScript` vào bản Tracker đã duyệt. Không sửa các hàm lọc, dữ liệu, CSV, điểm số hoặc khóa lưu trữ gốc.

## Nguyên nhân và phần sửa bố cục

- HDSD giữ padding 28px trên/dưới và margin dưới tiêu đề 16px. Bảng có display:table không co theo max-height như khối văn bản. Trước sửa, mục đóng đầu tiên đo 125px; có mục chứa bảng cao hơn 500px. Sau sửa, 11 mục đóng đo 59px ở cả bốn độ rộng, không có khoảng trắng giữa các separator.
- Lưới dùng 12 cột, hàng auto và cơ chế stretch theo chiều cao thẻ cao nhất. Thay bằng masonry: giữ thứ tự DOM, thẻ rộng theo class có sẵn, cột tối thiểu 280px, gap 16px; ResizeObserver debounce 60ms cập nhật khi nội dung/chiều rộng đổi.
- Fallback dùng hàng 1px để sai số gap dưới 1px; đây là điều chỉnh so với ví dụ 8px nhằm đạt dung sai ±2px bạn yêu cầu. Trình duyệt hỗ trợ grid-template-rows:masonry dùng cách native.
- Grid dense đưa thẻ nhỏ vào chỗ trống nếu vừa kích thước. Với thẻ toàn hàng hoặc nhiều cột, một hốc nhỏ hơn kích thước thẻ không thể luôn được lấp mà vẫn giữ chiều rộng/thứ tự DOM. Bản sửa loại bỏ hàng cao bị giữ lại khi đóng; không hứa xóa mọi hốc hình học cho mọi tổ hợp thẻ.

## Kiểm tra đã thực hiện

- Đo 1440/1024/768/390px; HDSD đóng 59px, không chồng thẻ; thẻ đóng có tiêu đề và dải giá trị/đánh giá.
- Mở/đóng biểu đồ 10 lần, chiều cao không lệch; canvas mở lại có kích thước đúng. Dark và Soft Light; desktop popover, mobile bottom sheet, Tab/Enter/Esc và trả focus.
- Nhập hai CSV khác nhau vào bản trước và sau: giá, điểm, RS, Risk, Data Quality giống nhau; câu giải thích cập nhật và không nhân đôi.
- CSV xuất ra giống từng ký tự; thứ tự sắp xếp và nguyên văn ô giá trị giữ nguyên.
- Công tắc chỉ ghi tracker_ui_help_v1; tải lại giữ lựa chọn; chip đánh giá vẫn hiện khi tắt câu giải thích. Tôn trọng reduced-motion; không có pageerror trong các ca thử.
- Phần giải thích dùng dữ liệu DOM, không tính lại chỉ số. Nút giải thích ô dữ liệu được gắn khi ô gần vùng nhìn để tránh thêm hàng nghìn nút một lúc.

## B.9(i) — thẻ đã gắn và thẻ bỏ qua

| Trang | Thẻ | Trạng thái / lý do |
|---|---|---|
| screener | Regime hiện tại | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| screener | Risk Level | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| screener | Breadth > MA50 | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| screener | Breadth > MA200 | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| screener | Distribution Days | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| screener | Setup nên xem | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| screener | A+ / A | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| screener | Regime Fit ≥ 70 | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| screener | Risk Ready | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| screener | Avoid / Warning | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| screener | Avg Tracker Score | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| screener | Avg Risk Score | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| overview | Regime | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| overview | Breadth > MA50 | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| overview | Breadth > MA200 | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| overview | Breakout hiện tại | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| overview | Sector Rotation | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| overview | 4 chu kỳ cổ phiếu | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| overview | Top Ranking | Bảng xếp hạng không có điểm chính riêng; giải thích nằm ở cột/chỉ số nhận diện được. |
| overview | Top 10 khối lượng · 1 ngày | Bảng khối lượng có mô tả kỳ/đơn vị gốc; không có ngưỡng tốt/xấu chung cho tổng volume. |
| overview | Top 10 khối lượng · 1 tuần | Bảng khối lượng có mô tả kỳ/đơn vị gốc; không có ngưỡng tốt/xấu chung cho tổng volume. |
| overview | Top 10 khối lượng · 1 tháng | Bảng khối lượng có mô tả kỳ/đơn vị gốc; không có ngưỡng tốt/xấu chung cho tổng volume. |
| overview | Top 10 khối lượng · 3 tháng | Bảng khối lượng có mô tả kỳ/đơn vị gốc; không có ngưỡng tốt/xấu chung cho tổng volume. |
| settings | Appearance | Thiết lập theme, không phải chỉ số. |
| settings | Backup / Restore | Công cụ dữ liệu cá nhân, không phải chỉ số. |
| settings | Mobile / PWA-like | Hướng dẫn sử dụng, không phải chỉ số. |
| settings | Data Quality | Có mô tả tuổi dữ liệu gốc; không suy chất lượng đầu tư từ công cụ kiểm tra. |
| settings | Diagnostics / Self-test | Công cụ kiểm tra kỹ thuật, không phải chỉ số thị trường. |
| watchlist | Watchlist nâng cao | Bảng dữ liệu cá nhân; giải thích từng cột nhận diện được, không đánh giá toàn danh sách. |
| lab | Research Lab v2 | Thanh công cụ chọn mã và tính lại, không có một chỉ số chính. |
| lab | CONFLUENCE | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| lab | BASE QUALITY | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| lab | MTF | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| lab | WEINSTEIN | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| lab | FPT — Advanced Chart | Biểu đồ chỉ vẽ giá lên canvas; không đọc giá từ pixel. |
| lab | Multi Score | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| lab | RS V2 | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| lab | Volume Intelligence | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| lab | Bollinger | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| lab | VCP V2 | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| lab | O’Neil Patterns | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| lab | Wyckoff Events | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| lab | Elder | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| lab | Anchored VWAP | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| lab | Explainable Evidence | Đã có Evidence/Violations và lời diễn giải gốc; giữ nội dung đó. |
| dashboard | MARKET HEALTH | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| dashboard | O’NEIL MARKET | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| dashboard | BREADTH > MA50 | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| dashboard | LEADERSHIP | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| dashboard | Top Setups — Evidence Ranking | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| dashboard | Market Timing | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| dashboard | Sector Rotation | Đã gắn: giá trị thật + chip + câu ngắn + nút thông tin. |
| dashboard | Data Engine V2 | Công cụ lưu/nạp dữ liệu, đã mô tả nguồn và schema. |

### Chỉ số phụ, cột và tham số

Đã gắn tooltip/chi tiết cho RS Rating; 1M/3M/6M/12M; các điểm Multi Score; RelVol, Z, Dry-up, Climax; 60D/30D/15D/7D; Cup/Flat/Double; Spring/SOS/LPS/Upthrust; các neo AVWAP; các pha cổ phiếu và RS ngành. Các giá trị trong câu như Distribution Days, MA200, BandWidth, %B, Force Index, Triple Screen và Pivot có nút thông tin riêng khi đọc được từ DOM.

Cột chính: Giá, GTGD TB20, Trend, Cách đỉnh 52W, RS, RS 3M/6M, RS Trend, Base/VCP, Breakout, Setup, Grade, Tracker Score, Market Fit, Risk Score, Risk, Action; thông tin Ngày/Data/Sàn/Ngành cũng có định nghĩa. Bảng Evidence Ranking dùng định nghĩa Base Quality/Volume Intelligence theo đúng module.

Các input có nhãn nhận diện được trong sáu nhóm cấu hình có nút thông tin đọc giá trị hiện tại. Tham số người dùng được giữ đánh giá xám vì không có một giá trị tốt/xấu cố định.

## B.9(ii) — ngưỡng và nguồn

Tất cả mốc dưới đây lấy từ logic hoặc văn bản hiện có trong Tracker. Không thêm mốc số thuộc nhóm “tham khảo kỹ thuật”; vì vậy danh sách ngưỡng số tự đặt để duyệt hiện rỗng. Màu tốt/trung tính/thận trọng là lớp diễn giải UI của điều kiện được nêu, không thay điểm số gốc.

| Chỉ số | Cách đọc / ngưỡng | Nguồn |
|---|---|---|
| Market Health | Màu trong app: từ 75 tốt, 55–dưới 75 trung gian, dưới 55 thận trọng. | Mã/văn bản Tracker |
| Confluence | Điểm = số nhóm đạt / 9 × 100. Màu app: 75 và 55. | Mã/văn bản Tracker |
| Base Quality | 85: A+ BASE; 75: A BASE; 60: WATCHABLE; dưới 60: LOW QUALITY. | Mã/văn bản Tracker |
| O’Neil Market | CONFIRMED UPTREND cần phiên xác nhận và không quá 4 phiên phân phối; RALLY ATTEMPT chưa xác nhận. | Mã/văn bản Tracker |
| Distribution Days | Số càng lớn, áp lực càng đáng chú ý. Dashboard dùng 30 phiên và giảm ít nhất 0,2%. | Mã/văn bản Tracker |
| Breadth > MA50 | Văn bản app: trên 45% thường hỗ trợ breakout. | Mã/văn bản Tracker |
| Breadth > MA200 | Văn bản app dùng vùng 35–40% làm vùng cần phòng thủ. | Mã/văn bản Tracker |
| Leadership | RS ≥80 là điều kiện thành viên; app chưa quy định tỷ lệ Leadership nào là tốt. | Mã/văn bản Tracker |
| Regime | Uptrend: tăng; Sideway: đi ngang; Downtrend/Correction: giảm/điều chỉnh. | Mã/văn bản Tracker |
| Risk Level | Thấp, trung bình, cao là nhãn do engine gốc cung cấp. | Mã/văn bản Tracker |
| Market Timing | Điểm Market dùng cùng thang Market Health; các thành phần cần đọc riêng. | Mã/văn bản Tracker |
| MTF | Điểm MTF ≥80: ALIGNED BULLISH; ≥55: CONSTRUCTIVE; ≤25: ALIGNED BEARISH; còn lại MIXED. | Mã/văn bản Tracker |
| Weinstein | App ưu tiên kiểm tra Stage 1 trước; Stage 2 cần giá trên MA30 tuần và độ dốc >1%. | Mã/văn bản Tracker |
| RS Rating | Advanced Engine dùng ≥80 cho bằng chứng RS leader; bộ lọc Leader/Early có ngưỡng tùy chỉnh riêng. | Mã/văn bản Tracker |
| 1M | Dương: vượt benchmark; âm: kém benchmark; 0: ngang benchmark. | Mã/văn bản Tracker |
| 3M | Dương: vượt benchmark; âm: kém benchmark; 0: ngang benchmark. | Mã/văn bản Tracker |
| 6M | Dương: vượt benchmark; âm: kém benchmark; 0: ngang benchmark. | Mã/văn bản Tracker |
| 12M | Dương: vượt benchmark; âm: kém benchmark; 0: ngang benchmark. | Mã/văn bản Tracker |
| RS 3M | Dương: vượt benchmark; âm: kém benchmark; 0: ngang benchmark. | Mã/văn bản Tracker |
| RS 6M | Dương: vượt benchmark; âm: kém benchmark; 0: ngang benchmark. | Mã/văn bản Tracker |
| Volume Intelligence | ≥75: HEALTHY ACCUMULATION; ≥55: CONSTRUCTIVE; ≥40: NEUTRAL; dưới 40: DISTRIBUTION RISK. | Mã/văn bản Tracker |
| RelVol | App đánh dấu RelVol ≥1,5; Dry-up <0,65; Climax >2,2. | Mã/văn bản Tracker |
| Z | App cộng điểm nếu Z>0,5 và trừ điểm nếu Z>2,5; cần đọc tổng thể. | Mã/văn bản Tracker |
| Dry-up | Dry-up là một điều kiện khối lượng; app cộng 10 điểm Volume nếu có. | Mã/văn bản Tracker |
| Climax | Climax là cảnh báo volume lớn; không chỉ rõ hướng giá. | Mã/văn bản Tracker |
| Bollinger | Percentile BandWidth ≤20: EXTREME; ≤35: TIGHT; ≥85: EXPANDED; còn lại NORMAL. | Mã/văn bản Tracker |
| BandWidth | Đọc cùng percentile 120 phiên; không có ngưỡng BandWidth tuyệt đối chung. | Mã/văn bản Tracker |
| %B | 0% ở biên dưới, 100% ở biên trên; có thể vượt ngoài khoảng này. | Mã/văn bản Tracker |
| VCP V2 | ≥85: HIGH QUALITY VCP; ≥65: VCP CANDIDATE; dưới 65: NO VCP. Bằng chứng Confluence dùng ≥70. | Mã/văn bản Tracker |
| Pivot | VCP dùng đỉnh của 19 phiên trước phiên cuối; cần volume và khoảng cách giá. | Mã/văn bản Tracker |
| O’Neil Patterns | Điểm từng mẫu ≥70 được app đánh dấu detected. | Mã/văn bản Tracker |
| Wyckoff Events | ACCUMULATION C/MARKUP: cấu trúc hỗ trợ; DISTRIBUTION RISK: cảnh báo; NEUTRAL RANGE: chưa rõ. | Mã/văn bản Tracker |
| Spring | ✓ hoặc ⚠ là sự kiện app đã thấy; — nghĩa là chưa ghi nhận. | Mã/văn bản Tracker |
| SOS | ✓ hoặc ⚠ là sự kiện app đã thấy; — nghĩa là chưa ghi nhận. | Mã/văn bản Tracker |
| LPS | ✓ hoặc ⚠ là sự kiện app đã thấy; — nghĩa là chưa ghi nhận. | Mã/văn bản Tracker |
| Upthrust | ✓ hoặc ⚠ là sự kiện app đã thấy; — nghĩa là chưa ghi nhận. | Mã/văn bản Tracker |
| Elder | GREEN: cả hai tăng; RED: cả hai giảm; BLUE: không đồng thuận. | Mã/văn bản Tracker |
| Triple Screen | PASS: tuần/ngày tăng và không RED; AVOID: tuần/ngày giảm; còn lại WAIT. | Mã/văn bản Tracker |
| Anchored VWAP | Neo tại đáy/đỉnh 52 tuần, phiên volume lớn nhất hoặc lần breakout. Giá trên ít nhất 3 neo là bằng chứng trong Confluence. | Mã/văn bản Tracker |
| Tracker Score | ≥82: A+; ≥70: A; ≥58: B; ≥45: Watch; còn lại Risky; cờ Avoid có quyền ưu tiên. | Mã/văn bản Tracker |
| Grade | A+/A cao; B/Watch theo dõi; Risky/Avoid thận trọng. | Mã/văn bản Tracker |
| Market Fit | Full Engine dùng Market Fit ≥70 cùng Tracker Score ≥55 và không Avoid. | Mã/văn bản Tracker |
| Risk Score | Risk Ready dùng ≥70 và Setup Score ≥40; một số pipeline còn yêu cầu thanh khoản. | Mã/văn bản Tracker |

### Vị trí logic để đối chiếu

- `tone(v)` trong module V2: 75/55. `marketHealth()` kết hợp regime, breadth, leadership và O’Neil.
- `baseQuality()`: 85/75/60; `vcp()`: 85/65; `advanced()` dùng VCP ≥70 và RS ≥80 làm bằng chứng.
- `bb()`: BandWidth percentile ≤20/≤35/≥85; không dự đoán hướng phá vỡ.
- `volumeIntelligence()`: dry-up <0,65, climax >2,2; nhãn điểm 75/55/40; các điều kiện Z>0,5 và Z>2,5.
- `weinstein()`, `mtf()`, `elder()` và `oneilMarket()` cung cấp trạng thái gốc. Không diễn giải STAGE/MTF bằng một điểm tổng không liên quan.
- `applyCompositeScores()`: Tracker Grade 82/70/58/45 và cờ Avoid ưu tiên. Full Engine: Market Fit ≥70; Risk Ready ≥70 cùng Setup ≥40.

## B.9(iii) — mục chưa có cơ sở để gán ngưỡng độc lập

Các mục sau giữ chip “Chưa đủ cơ sở” hoặc giải thích trạng thái trung tính khi phù hợp:

| Mục | Điều cần xác nhận nếu muốn thêm ngưỡng |
|---|---|
| Leadership | Tỷ lệ Leader bao nhiêu được coi tốt? Mốc RS≥80 chỉ xác định thành viên, không xác định tỷ lệ tốt. |
| Distribution Days | Hai module dùng cửa sổ/định nghĩa khác nhau; cần ngưỡng riêng cho từng module. |
| Breakout hiện tại; số mã theo bốn pha; A+/A, Risk Ready, Regime Fit, Avoid | Cần mẫu số và bối cảnh thị trường trước khi đánh giá số lượng. |
| RS ngành và lợi suất ngành | Không áp tự động ngưỡng Leader của một cổ phiếu lên trung bình ngành. Market Classic dùng lợi suất 20D, Dashboard dùng RS3M. |
| RelVol, Z, BandWidth, %B, độ co hẹp từng cửa sổ | Có định nghĩa/điều kiện thành phần trong app nhưng chưa đủ để đánh giá tốt/xấu đứng riêng. |
| Giá AVWAP/Pivot và giá cổ phiếu | Cần so với giá hiện tại và các điều kiện khác, không đánh giá mức giá tuyệt đối. |
| Force Index; các điểm thành phần Multi Score | Không có thang tốt/xấu thống nhất giữa các module hoặc các mã. |
| Risk % và Avg Risk/Tracker Score | Risk % khác Risk Score; trung bình universe không được dùng như Grade từng mã. |
| Thông số cấu hình | Đây là lựa chọn của người dùng; muốn ngưỡng “tối ưu” cần giả định và đánh giá chiến lược riêng. |

Không cần xác nhận để dùng lớp định nghĩa hiện tại. Chỉ cần duyệt thêm nếu muốn biến những mục xám này thành các ngưỡng đánh giá mới.

## Toàn bộ từ điển

Từ điển có 101 mục, khởi tạo một lần. Mỗi định nghĩa “Là gì” không quá 20 từ. Alias chuẩn hóa để nhận diện nhãn; bỏ qua nhãn lạ hoặc giá trị chưa có dữ liệu.

| Mục | Là gì | Dùng để làm gì | Cách đọc |
|---|---|---|---|
| Market Health | Điểm sức khỏe chung của thị trường, từ 0 đến 100. | Đọc bối cảnh trước khi xem từng cổ phiếu. | Màu trong app: từ 75 tốt, 55–dưới 75 trung gian, dưới 55 thận trọng. |
| Confluence | Tỷ lệ đồng thuận của chín nhóm bằng chứng kỹ thuật. | Xem có nhiều chỉ báo cùng hỗ trợ hay không. | Điểm = số nhóm đạt / 9 × 100. Màu app: 75 và 55. |
| Base Quality | Điểm chất lượng nền giá từ mẫu hình, khối lượng, RS, thị trường và độ chặt. | So sánh chất lượng nền trước khi đọc điểm phá vỡ. | 85: A+ BASE; 75: A BASE; 60: WATCHABLE; dưới 60: LOW QUALITY. |
| O’Neil Market | Trạng thái thị trường theo mô hình hồi phục và phiên xác nhận của app. | Phân biệt nỗ lực hồi phục với xu hướng đã được xác nhận. | CONFIRMED UPTREND cần phiên xác nhận và không quá 4 phiên phân phối; RALLY ATTEMPT chưa xác nhận. |
| Distribution Days | Số phiên giảm giá kèm khối lượng lớn hơn phiên trước. | Theo dõi áp lực phân phối trong cửa sổ app đang dùng. | Số càng lớn, áp lực càng đáng chú ý. Dashboard dùng 30 phiên và giảm ít nhất 0,2%. |
| Breadth > MA50 | Tỷ lệ cổ phiếu có giá cao hơn trung bình 50 phiên. | Đo mức lan tỏa của xu hướng ngắn và trung hạn. | Văn bản app: trên 45% thường hỗ trợ breakout. |
| Breadth > MA200 | Tỷ lệ cổ phiếu nằm trên trung bình 200 phiên. | Đọc mức lan tỏa của xu hướng dài hơn. | Văn bản app dùng vùng 35–40% làm vùng cần phòng thủ. |
| Leadership | Tỷ lệ cổ phiếu trong mẫu có RS Rating từ 80 trở lên. | Xem độ phổ biến của nhóm dẫn dắt. | RS ≥80 là điều kiện thành viên; app chưa quy định tỷ lệ Leadership nào là tốt. |
| Regime | Phân loại môi trường xu hướng chung của thị trường. | Đọc các kiểu setup phù hợp với bối cảnh. | Uptrend: tăng; Sideway: đi ngang; Downtrend/Correction: giảm/điều chỉnh. |
| Risk Level | Mức rủi ro của bối cảnh thị trường theo app. | Đặt các setup riêng lẻ trong bối cảnh rủi ro chung. | Thấp, trung bình, cao là nhãn do engine gốc cung cấp. |
| Setup nên xem | Nhóm mẫu hình mà engine ưu tiên trong regime hiện tại. | Định hướng nhóm tiêu chí cần đọc tiếp. | Đọc giá trị và nhãn hiện tại cùng các thành phần liên quan; không có ngưỡng tốt/xấu đơn lẻ. |
| Breakout hiện tại | Số mã đang thỏa điều kiện breakout của app. | Đếm độ phổ biến của tín hiệu phá vỡ. | Đọc giá trị và nhãn hiện tại cùng các thành phần liên quan; không có ngưỡng tốt/xấu đơn lẻ. |
| Top Setups — Evidence Ranking | Danh sách xếp hạng theo tổng Confluence và Base Quality. | Chọn mã để nghiên cứu bằng chứng chi tiết. | Đọc giá trị và nhãn hiện tại cùng các thành phần liên quan; không có ngưỡng tốt/xấu đơn lẻ. |
| Sector Rotation | So sánh sức mạnh tương đối giữa các ngành. | Xem ngành nào mạnh hơn trong mẫu đang có. | Đọc giá trị và nhãn hiện tại cùng các thành phần liên quan; không có ngưỡng tốt/xấu đơn lẻ. |
| 4 chu kỳ cổ phiếu | Số mã ở các pha tích lũy, tăng, phân phối và giảm. | Đọc cấu trúc pha của toàn bộ mẫu. | Đọc giá trị và nhãn hiện tại cùng các thành phần liên quan; không có ngưỡng tốt/xấu đơn lẻ. |
| Multi Score | Các điểm thành phần xu hướng, động lượng, khối lượng, RS, mẫu hình, chất lượng và rủi ro. | Xem mặt mạnh và yếu thay vì chỉ một điểm tổng. | Đọc giá trị và nhãn hiện tại cùng các thành phần liên quan; không có ngưỡng tốt/xấu đơn lẻ. |
| Setup | Mẫu hình kỹ thuật được engine nhận diện. | Đọc điều kiện nền và bối cảnh của tín hiệu. | Đọc giá trị và nhãn hiện tại cùng các thành phần liên quan; không có ngưỡng tốt/xấu đơn lẻ. |
| Base | Trạng thái nền giá hoặc co hẹp biến động. | Kiểm tra cấu trúc trước điểm phá vỡ. | Đọc giá trị và nhãn hiện tại cùng các thành phần liên quan; không có ngưỡng tốt/xấu đơn lẻ. |
| Breakout | Trạng thái giá so với vùng phá vỡ của app. | Đọc khoảng cách tới pivot cùng khối lượng. | Đọc giá trị và nhãn hiện tại cùng các thành phần liên quan; không có ngưỡng tốt/xấu đơn lẻ. |
| Action | Mô tả hướng theo dõi do engine gốc tạo ra. | Hiểu kết luận của app sau các điều kiện. | Đọc giá trị và nhãn hiện tại cùng các thành phần liên quan; không có ngưỡng tốt/xấu đơn lẻ. |
| RS Trend | Hướng thay đổi sức mạnh tương đối. | Xem sức mạnh đang cải thiện hay suy yếu. | Đọc giá trị và nhãn hiện tại cùng các thành phần liên quan; không có ngưỡng tốt/xấu đơn lẻ. |
| Market Timing | Tổng hợp điểm thị trường và các thành phần breadth, leadership, O’Neil. | Đối chiếu những thành phần đang hỗ trợ hoặc gây áp lực. | Điểm Market dùng cùng thang Market Health; các thành phần cần đọc riêng. |
| MTF | Mức đồng thuận xu hướng ngày, tuần và tháng. | Phát hiện xung đột giữa các khung thời gian. | Điểm MTF ≥80: ALIGNED BULLISH; ≥55: CONSTRUCTIVE; ≤25: ALIGNED BEARISH; còn lại MIXED. |
| Weinstein | Giai đoạn xu hướng dựa trên giá và trung bình 30 tuần. | Phân biệt nền tích lũy, tăng, tạo đỉnh và giảm. | App ưu tiên kiểm tra Stage 1 trước; Stage 2 cần giá trên MA30 tuần và độ dốc >1%. |
| RS Rating | Thứ hạng sức mạnh tương đối của mã trong mẫu cổ phiếu. | So sánh mã với nhóm còn lại, không nhầm với RSI. | Advanced Engine dùng ≥80 cho bằng chứng RS leader; bộ lọc Leader/Early có ngưỡng tùy chỉnh riêng. |
| 1M | Hiệu suất tương đối so với chỉ số tham chiếu trong kỳ. | Xem mã vượt hay kém benchmark ở từng khoảng thời gian. | Dương: vượt benchmark; âm: kém benchmark; 0: ngang benchmark. |
| 3M | Hiệu suất tương đối so với chỉ số tham chiếu trong kỳ. | Xem mã vượt hay kém benchmark ở từng khoảng thời gian. | Dương: vượt benchmark; âm: kém benchmark; 0: ngang benchmark. |
| 6M | Hiệu suất tương đối so với chỉ số tham chiếu trong kỳ. | Xem mã vượt hay kém benchmark ở từng khoảng thời gian. | Dương: vượt benchmark; âm: kém benchmark; 0: ngang benchmark. |
| 12M | Hiệu suất tương đối so với chỉ số tham chiếu trong kỳ. | Xem mã vượt hay kém benchmark ở từng khoảng thời gian. | Dương: vượt benchmark; âm: kém benchmark; 0: ngang benchmark. |
| RS 3M | Hiệu suất tương đối so với chỉ số tham chiếu trong kỳ. | Xem mã vượt hay kém benchmark ở từng khoảng thời gian. | Dương: vượt benchmark; âm: kém benchmark; 0: ngang benchmark. |
| RS 6M | Hiệu suất tương đối so với chỉ số tham chiếu trong kỳ. | Xem mã vượt hay kém benchmark ở từng khoảng thời gian. | Dương: vượt benchmark; âm: kém benchmark; 0: ngang benchmark. |
| Volume Intelligence | Điểm cấu trúc khối lượng, kết hợp lực tăng/giảm, OBV và biến động volume. | Phân biệt dòng tiền hỗ trợ với áp lực phân phối. | ≥75: HEALTHY ACCUMULATION; ≥55: CONSTRUCTIVE; ≥40: NEUTRAL; dưới 40: DISTRIBUTION RISK. |
| RelVol | Khối lượng phiên mới nhất chia trung bình 20 phiên. | Nhận biết phiên có giao dịch khác thường. | App đánh dấu RelVol ≥1,5; Dry-up <0,65; Climax >2,2. |
| Z | Khoảng cách volume hiện tại so với trung bình 60 phiên, theo độ lệch chuẩn. | Nhận biết khối lượng bất thường. | App cộng điểm nếu Z>0,5 và trừ điểm nếu Z>2,5; cần đọc tổng thể. |
| Dry-up | Khối lượng thấp hơn 65% trung bình 20 phiên. | Xem mức cạn cung, cần đặt trong bối cảnh nền giá. | Dry-up là một điều kiện khối lượng; app cộng 10 điểm Volume nếu có. |
| Climax | Khối lượng vượt 2,2 lần trung bình 20 phiên. | Nhận biết giao dịch đột biến để xem thêm đồ thị. | Climax là cảnh báo volume lớn; không chỉ rõ hướng giá. |
| Bollinger | Trạng thái co giãn của dải biến động Bollinger. | Xem biến động đang co hẹp hay mở rộng. | Percentile BandWidth ≤20: EXTREME; ≤35: TIGHT; ≥85: EXPANDED; còn lại NORMAL. |
| BandWidth | Độ rộng dải Bollinger chia đường giữa, tính theo phần trăm. | So độ biến động hiện tại với lịch sử của chính mã. | Đọc cùng percentile 120 phiên; không có ngưỡng BandWidth tuyệt đối chung. |
| %B | Vị trí giá trong dải Bollinger từ biên dưới tới biên trên. | Xem giá nằm gần biên nào. | 0% ở biên dưới, 100% ở biên trên; có thể vượt ngoài khoảng này. |
| VCP V2 | Điểm nhận diện nền co hẹp biến động theo nhiều cửa sổ. | Kiểm tra độ chặt của nền và vùng pivot. | ≥85: HIGH QUALITY VCP; ≥65: VCP CANDIDATE; dưới 65: NO VCP. Bằng chứng Confluence dùng ≥70. |
| 60D | Biên độ từ đáy tới đỉnh trong cửa sổ số phiên tương ứng. | So các cửa sổ để nhận biết độ co hẹp dần. | App cộng điểm khi cửa sổ sau nhỏ hơn 90% cửa sổ trước; không có ngưỡng đơn lẻ chung. |
| 30D | Biên độ từ đáy tới đỉnh trong cửa sổ số phiên tương ứng. | So các cửa sổ để nhận biết độ co hẹp dần. | App cộng điểm khi cửa sổ sau nhỏ hơn 90% cửa sổ trước; không có ngưỡng đơn lẻ chung. |
| 15D | Biên độ từ đáy tới đỉnh trong cửa sổ số phiên tương ứng. | So các cửa sổ để nhận biết độ co hẹp dần. | App cộng điểm khi cửa sổ sau nhỏ hơn 90% cửa sổ trước; không có ngưỡng đơn lẻ chung. |
| 7D | Biên độ từ đáy tới đỉnh trong cửa sổ số phiên tương ứng. | So các cửa sổ để nhận biết độ co hẹp dần. | App cộng điểm khi cửa sổ sau nhỏ hơn 90% cửa sổ trước; không có ngưỡng đơn lẻ chung. |
| Pivot | Mốc giá đỉnh của vùng nền được app chọn. | Đối chiếu giá hiện tại với điểm phá vỡ. | VCP dùng đỉnh của 19 phiên trước phiên cuối; cần volume và khoảng cách giá. |
| O’Neil Patterns | Điểm khớp các mẫu cốc tay cầm, nền phẳng hoặc hai đáy. | Tìm mẫu cấu trúc để kiểm tra trên đồ thị. | Điểm từng mẫu ≥70 được app đánh dấu detected. |
| Wyckoff Events | Nhãn các sự kiện kiểm tra cung cầu trong vùng tích lũy hoặc phân phối. | Xem dấu hiệu spring, sức mạnh, kiểm tra hỗ trợ và phá vỡ thất bại. | ACCUMULATION C/MARKUP: cấu trúc hỗ trợ; DISTRIBUTION RISK: cảnh báo; NEUTRAL RANGE: chưa rõ. |
| Spring | Giá xuyên hỗ trợ rồi đóng trở lại phía trên. | Đọc sự kiện cung cầu trong bối cảnh nền. | ✓ hoặc ⚠ là sự kiện app đã thấy; — nghĩa là chưa ghi nhận. |
| SOS | Giá vượt kháng cự với volume trên 1,25 lần trung bình. | Đọc sự kiện cung cầu trong bối cảnh nền. | ✓ hoặc ⚠ là sự kiện app đã thấy; — nghĩa là chưa ghi nhận. |
| LPS | Giá kiểm tra lại vùng SOS với volume thấp. | Đọc sự kiện cung cầu trong bối cảnh nền. | ✓ hoặc ⚠ là sự kiện app đã thấy; — nghĩa là chưa ghi nhận. |
| Upthrust | Giá xuyên kháng cự rồi đóng trở lại bên dưới. | Đọc sự kiện cung cầu trong bối cảnh nền. | ✓ hoặc ⚠ là sự kiện app đã thấy; — nghĩa là chưa ghi nhận. |
| Elder | Màu xung lực kết hợp độ dốc EMA13 và MACD histogram. | Xem xu hướng và động lượng có đồng hướng hay không. | GREEN: cả hai tăng; RED: cả hai giảm; BLUE: không đồng thuận. |
| Triple Screen | Nhãn phối hợp xu hướng tuần, ngày và xung lực Elder. | Xem sự đồng thuận theo quy tắc của app. | PASS: tuần/ngày tăng và không RED; AVOID: tuần/ngày giảm; còn lại WAIT. |
| Force Index | Thay đổi giá một phiên nhân với khối lượng phiên đó. | Đọc hướng và cường độ lực giá–khối lượng. | Dương: giá tăng; âm: giá giảm; gần 0: lực đo được thấp. |
| Anchored VWAP | Giá trung bình theo khối lượng tính từ một mốc neo. | So giá với chi phí giao dịch bình quân từ mốc sự kiện. | Neo tại đáy/đỉnh 52 tuần, phiên volume lớn nhất hoặc lần breakout. Giá trên ít nhất 3 neo là bằng chứng trong Confluence. |
| Tracker Score | Điểm tổng hợp setup, market fit, xu hướng, RS, rủi ro và volume. | Xếp hạng các mã trong cùng nguồn dữ liệu. | ≥82: A+; ≥70: A; ≥58: B; ≥45: Watch; còn lại Risky; cờ Avoid có quyền ưu tiên. |
| Grade | Hạng tổng hợp của mã sau khi engine xét điểm và cờ Avoid. | Đọc nhanh nhóm xếp hạng. | A+/A cao; B/Watch theo dõi; Risky/Avoid thận trọng. |
| Market Fit | Điểm mức phù hợp giữa setup và regime hiện tại. | Đọc setup trong bối cảnh thị trường thay vì tách rời. | Full Engine dùng Market Fit ≥70 cùng Tracker Score ≥55 và không Avoid. |
| Risk Score | Điểm đánh giá cấu trúc rủi ro; điểm cao hơn là thuận lợi hơn theo app. | Kiểm tra khoảng cách stop và chất lượng kế hoạch kỹ thuật. | Risk Ready dùng ≥70 và Setup Score ≥40; một số pipeline còn yêu cầu thanh khoản. |
| Risk | Khoảng cách phần trăm từ giá hiện tại tới mức stop giả định. | Ước lượng biên độ chịu đựng theo cấu trúc giá. | Risk nhỏ hơn là stop gần hơn, nhưng stop quá sát cũng dễ bị nhiễu. |
| Trend | Trạng thái xu hướng hoặc điểm xu hướng từ các đường trung bình. | Đối chiếu với các thành phần và bối cảnh của cùng module. | Không suy tốt/xấu từ số lượng hoặc một điểm thành phần khi chưa biết đầy đủ bối cảnh. |
| Momentum | Điểm động lượng từ RSI và biến động giá gần đây. | Đối chiếu với các thành phần và bối cảnh của cùng module. | Không suy tốt/xấu từ số lượng hoặc một điểm thành phần khi chưa biết đầy đủ bối cảnh. |
| Volume | Điểm khối lượng của module đang xem. | Đối chiếu với các thành phần và bối cảnh của cùng module. | Không suy tốt/xấu từ số lượng hoặc một điểm thành phần khi chưa biết đầy đủ bối cảnh. |
| Pattern | Điểm mẫu hình tốt nhất theo module đang xem. | Đối chiếu với các thành phần và bối cảnh của cùng module. | Không suy tốt/xấu từ số lượng hoặc một điểm thành phần khi chưa biết đầy đủ bối cảnh. |
| Tích lũy | Số mã được engine phân vào pha nền tích lũy. | Đối chiếu với các thành phần và bối cảnh của cùng module. | Không suy tốt/xấu từ số lượng hoặc một điểm thành phần khi chưa biết đầy đủ bối cảnh. |
| Tăng giá | Số mã được engine phân vào pha tăng. | Đối chiếu với các thành phần và bối cảnh của cùng module. | Không suy tốt/xấu từ số lượng hoặc một điểm thành phần khi chưa biết đầy đủ bối cảnh. |
| Phân phối | Số mã được engine phân vào pha phân phối. | Đối chiếu với các thành phần và bối cảnh của cùng module. | Không suy tốt/xấu từ số lượng hoặc một điểm thành phần khi chưa biết đầy đủ bối cảnh. |
| Giảm giá | Số mã được engine phân vào pha giảm. | Đối chiếu với các thành phần và bối cảnh của cùng module. | Không suy tốt/xấu từ số lượng hoặc một điểm thành phần khi chưa biết đầy đủ bối cảnh. |
| Ngưỡng Leader Track, RS percentile | Ngưỡng RS do bạn đặt để lọc nhóm Leader. | Hiểu điều kiện đang đặt trước khi chạy bộ lọc. | Đây là tham số người dùng, không có giá trị tốt/xấu cố định. Giá trị hiển thị được đọc trực tiếp từ ô nhập. |
| Ngưỡng Early Watch, RS percentile | Ngưỡng RS do bạn đặt để lọc nhóm Early. | Hiểu điều kiện đang đặt trước khi chạy bộ lọc. | Đây là tham số người dùng, không có giá trị tốt/xấu cố định. Giá trị hiển thị được đọc trực tiếp từ ô nhập. |
| Volume breakout / Volume TB 50 | Tỷ lệ khối lượng cần có so với trung bình 50 phiên. | Hiểu điều kiện đang đặt trước khi chạy bộ lọc. | Đây là tham số người dùng, không có giá trị tốt/xấu cố định. Giá trị hiển thị được đọc trực tiếp từ ô nhập. |
| GTGD TB 20 phiên tối thiểu, đơn vị tỷ VND | Mức giá trị giao dịch bình quân tối thiểu, tính theo tỷ đồng. | Hiểu điều kiện đang đặt trước khi chạy bộ lọc. | Đây là tham số người dùng, không có giá trị tốt/xấu cố định. Giá trị hiển thị được đọc trực tiếp từ ô nhập. |
| Volume TB 20 phiên tối thiểu | Số cổ phiếu giao dịch bình quân tối thiểu mỗi phiên. | Hiểu điều kiện đang đặt trước khi chạy bộ lọc. | Đây là tham số người dùng, không có giá trị tốt/xấu cố định. Giá trị hiển thị được đọc trực tiếp từ ô nhập. |
| Giá tối thiểu, VND/cp | Giá thấp nhất được phép qua điều kiện thanh khoản. | Hiểu điều kiện đang đặt trước khi chạy bộ lọc. | Đây là tham số người dùng, không có giá trị tốt/xấu cố định. Giá trị hiển thị được đọc trực tiếp từ ô nhập. |
| Giá cách đỉnh 52 tuần tối đa | Khoảng cách tối đa dưới đỉnh 52 tuần, biểu diễn dạng tỷ lệ. | Hiểu điều kiện đang đặt trước khi chạy bộ lọc. | Đây là tham số người dùng, không có giá trị tốt/xấu cố định. Giá trị hiển thị được đọc trực tiếp từ ô nhập. |
| Giá cao hơn đáy 52 tuần tối thiểu | Mức tăng tối thiểu trên đáy 52 tuần, dạng tỷ lệ. | Hiểu điều kiện đang đặt trước khi chạy bộ lọc. | Đây là tham số người dùng, không có giá trị tốt/xấu cố định. Giá trị hiển thị được đọc trực tiếp từ ô nhập. |
| Số ngày tính độ dốc MA200 | Số phiên dùng so sánh độ dốc trung bình 200 phiên. | Hiểu điều kiện đang đặt trước khi chạy bộ lọc. | Đây là tham số người dùng, không có giá trị tốt/xấu cố định. Giá trị hiển thị được đọc trực tiếp từ ô nhập. |
| Mã chỉ số so sánh | Mã benchmark dùng làm chuẩn sức mạnh tương đối. | Hiểu điều kiện đang đặt trước khi chạy bộ lọc. | Đây là tham số người dùng, không có giá trị tốt/xấu cố định. Giá trị hiển thị được đọc trực tiếp từ ô nhập. |
| Số phiên tìm nền giá | Độ dài cửa sổ dùng tìm cấu trúc nền. | Hiểu điều kiện đang đặt trước khi chạy bộ lọc. | Đây là tham số người dùng, không có giá trị tốt/xấu cố định. Giá trị hiển thị được đọc trực tiếp từ ô nhập. |
| Khoảng cách tới pivot để coi là gần | Khoảng cách dạng tỷ lệ dùng nhận diện giá gần pivot. | Hiểu điều kiện đang đặt trước khi chạy bộ lọc. | Đây là tham số người dùng, không có giá trị tốt/xấu cố định. Giá trị hiển thị được đọc trực tiếp từ ô nhập. |
| Nguồn miễn phí | Nguồn dữ liệu mà tính năng cập nhật gốc đang chọn. | Hiểu điều kiện đang đặt trước khi chạy bộ lọc. | Đây là tham số người dùng, không có giá trị tốt/xấu cố định. Giá trị hiển thị được đọc trực tiếp từ ô nhập. |
| Số phiên lịch sử cần tải | Số phiên lịch sử yêu cầu từ công cụ cập nhật. | Hiểu điều kiện đang đặt trước khi chạy bộ lọc. | Đây là tham số người dùng, không có giá trị tốt/xấu cố định. Giá trị hiển thị được đọc trực tiếp từ ô nhập. |
| Giới hạn số mã/lần, 0 = toàn bộ | Số mã tối đa mỗi lần tải; số 0 nghĩa là toàn bộ. | Hiểu điều kiện đang đặt trước khi chạy bộ lọc. | Đây là tham số người dùng, không có giá trị tốt/xấu cố định. Giá trị hiển thị được đọc trực tiếp từ ô nhập. |
| Số luồng tải song song | Số yêu cầu cập nhật chạy đồng thời. | Hiểu điều kiện đang đặt trước khi chạy bộ lọc. | Đây là tham số người dùng, không có giá trị tốt/xấu cố định. Giá trị hiển thị được đọc trực tiếp từ ô nhập. |
| Risk (Multi Score) | Điểm rủi ro Advanced Engine, từ 100 trừ tám lần ATR phần trăm. | Đọc giá trị trong bối cảnh của cùng mẫu dữ liệu. | Điểm cao nghĩa là biến động ATR thấp hơn; khác Risk % tới stop trong bảng chính. |
| RS ngành | Trung bình RS percentile của các mã trong ngành. | Đọc giá trị trong bối cảnh của cùng mẫu dữ liệu. | Dùng xếp hạng ngành; không áp mốc Leader của một cổ phiếu cho cả ngành. |
| Lợi suất ngành 20D | Trung bình lợi suất giá 20 phiên của các mã trong ngành. | Đọc giá trị trong bối cảnh của cùng mẫu dữ liệu. | Market Classic dùng return20Pct; dương là tăng và âm là giảm trong kỳ. |
| RS ngành 3M | Trung bình RS ba tháng của các mã trong ngành. | Đọc giá trị trong bối cảnh của cùng mẫu dữ liệu. | Dashboard dùng rs3m; khác lợi suất giá 20D ở Market Classic. |
| A+ / A | Số mã thuộc hạng A+ hoặc A. | Đọc giá trị trong bối cảnh của cùng mẫu dữ liệu. | Đếm Grade gốc; số lượng lớn không tự nó bảo đảm thị trường tốt. |
| Regime Fit ≥ 70 | Số mã có Market Fit đạt ít nhất 70. | Đọc giá trị trong bối cảnh của cùng mẫu dữ liệu. | Chỉ đếm riêng điều kiện Market Fit. |
| Risk Ready | Số mã có Risk Score từ 70 và Setup Score từ 40. | Đọc giá trị trong bối cảnh của cùng mẫu dữ liệu. | Các pipeline có thể còn yêu cầu thanh khoản. |
| Avoid / Warning | Số mã có cờ tránh, phân phối hoặc Risk Score dưới 35. | Đọc giá trị trong bối cảnh của cùng mẫu dữ liệu. | Đây là số lượng cảnh báo, cần so với tổng số mã. |
| Avg Tracker Score | Trung bình Tracker Score trong universe hiện tại. | Đọc giá trị trong bối cảnh của cùng mẫu dữ liệu. | Không dùng ngưỡng Grade từng cổ phiếu để đánh giá trung bình toàn mẫu. |
| Avg Risk Score | Trung bình Risk Score trong universe hiện tại. | Đọc giá trị trong bối cảnh của cùng mẫu dữ liệu. | Cao hơn nghĩa là điểm rủi ro theo app tốt hơn; không phải rủi ro danh mục. |
| Giá | Giá đóng cửa của phiên dữ liệu đang hiển thị. | Đối chiếu ngày dữ liệu, các đường trung bình, pivot và stop. | Một mức giá đứng riêng không xác định chất lượng hay định giá cổ phiếu. |
| GTGD TB20 | Giá trị giao dịch bình quân 20 phiên, tính bằng tỷ đồng. | Đọc mức thanh khoản trước khi xem setup. | Đối chiếu ngưỡng Thanh khoản bạn đang đặt trong cấu hình. |
| Cách đỉnh 52W | Khoảng cách phần trăm từ giá hiện tại tới đỉnh 52 tuần. | Xem vị trí giá trong biên độ một năm. | Âm nghĩa là giá đang dưới đỉnh; không đánh giá chất lượng chỉ bằng khoảng cách này. |
| Data | Nhóm tuổi dữ liệu so với ngày chuẩn của dataset. | Kiểm tra tín hiệu có đang dùng dữ liệu đủ gần không. | D0 là ngày chuẩn của dataset; D-1 là phiên trước đó, không đồng nghĩa ngày lịch hôm nay. |
| Ngày | Ngày của phiên dữ liệu cuối cùng đang hiển thị. | Đối chiếu độ mới của giá và tín hiệu. | Ngày của từng mã có thể khác ngày chỉ số hoặc nguồn cập nhật. |
| Sàn | Sàn giao dịch của mã theo dữ liệu đang nạp. | Phân biệt HOSE, HNX và UPCOM. | Đây là thông tin mô tả, không phải chỉ số tốt/xấu. |
| Ngành | Nhóm ngành của mã theo dữ liệu phân loại. | Đặt sức mạnh của mã trong bối cảnh ngành. | Ngành chưa phân loại có thể thiếu dữ liệu; không tự suy ra ngành khác. |