# AI Analyst theo master prompt — bản nâng cấp 1.1

Câu “Phân tích HPG” trước đây chỉ đi qua kỹ thuật nếu người dùng không nêu riêng “cơ bản” hoặc “tin tức”. Bản này nhận diện câu phân tích tổng quát, thu thập kỹ thuật, BCTC, tin mã, tin ngành/vĩ mô và môi trường thị trường trước một lần tổng hợp AI. Lỗi một nguồn được giữ thành cảnh báo; không biến dữ liệu thiếu thành số không.

## Kiến trúc đang dùng

- Trang chính: GitHub Pages, mã trong public/index.html; snapshot chung public/data/market.json.gz.
- Dữ liệu: Vnstock/KBS qua workflow hiện hữu; công thức kỹ thuật trong public/shared/tracker-engine.js.
- Backend đã có: Node trên Render, lớp Gateway giữ khóa, xác nhận Free Tier, kiểm tra model tồn tại, giữ chỗ token, cache và dự phòng Gemini/Groq.
- Bản nâng cấp tái sử dụng backend đó; chưa chuyển sang Cloudflare, chưa thay bộ lọc/Backtest hay hợp đồng snapshot.
- SSE là kết nối một chiều để máy chủ đẩy tiến độ xuống giao diện. Endpoint mới dùng cùng cookie đăng nhập, kiểm tra Origin, giới hạn số luồng, dọn listener và có polling dự phòng.
- Trợ lý không được chạy code tùy ý. Máy chủ gọi một danh sách công cụ cố định, có thời gian chờ riêng. Bản này chưa triển khai vòng function calling tự chủ tám lượt hoặc tìm web bằng model.

## Thay đổi người dùng nhìn thấy

1. Câu hỏi tổng quát mặc định lấy cả cơ bản và tin; “Phân tích kỹ thuật HPG” vẫn giữ luồng kỹ thuật nhanh.
2. Báo cáo tám mục: kết luận, điểm, kỹ thuật/thị trường, cơ bản, tin/ngành, rủi ro/kịch bản xấu, dữ liệu thiếu, nguồn.
3. Có nút AI ở dòng bảng cổ phiếu chính; mở đúng mã trên backend, chưa tự gửi câu hỏi.
4. Nguồn có link mở được; RSS có ngày đăng, nhà xuất bản, trích đoạn ngắn, cờ tin cũ và lọc trùng.
5. Giá, tỷ lệ volume so trung bình hai mươi phiên và biến động do code tính; nguyên công thức Tracker được tái sử dụng.
6. Playbook thị trường được ghi rõ là quy tắc, chưa phải tỷ lệ thắng setup được backtest kiểm chứng.
7. Câu hỏi có dấu hiệu chứa giá vốn, danh mục cá nhân, NAV, email hoặc khóa bị chặn trước khi gọi model. Đây là lớp chặn mẫu thông dụng, không bảo đảm phát hiện mọi cách viết; giao diện luôn nhắc chỉ nhập dữ liệu công khai.
8. Phân tích tổng quát chỉ yêu cầu một lần tổng hợp; có thể phát sinh lần gọi dự phòng theo cấu hình nếu nhà cung cấp lỗi. Không tự gọi AI hằng ngày cho từng mã.

## Điểm tổng hợp và chất lượng dữ liệu

Kỹ thuật lấy nguyên trackerScore. Bộ tính tổng hỗ trợ trọng số và ngưỡng A/B/C cấu hình, nhưng chỉ tính khi đủ thành phần có trọng số. Chưa có bộ chuẩn hóa BCTC/tin/ngành đã kiểm chứng trong mã hiện hữu, nên điểm các thành phần này, tổng và hạng mặc định để trống. Không lấy điểm kỹ thuật làm hạng tổng hợp, không để model tự điền.

Hợp đồng phản hồi bắt buộc có mục rủi ro, kiểm tra mã nguồn dẫn và số liệu đã xuất hiện trong nguồn, chặn hạng không có trong kết quả công cụ. Kiểm tra số liệu xuất hiện chưa chứng minh đúng ngữ nghĩa, đơn vị hoặc kỳ; vẫn cần đối chiếu tài chính bằng nguồn thật.

Bản Vnstock adapter cũ được giữ nguyên, chưa đoán API mới. Đã thử tải solution-architect bằng vnai.agents.load_skill, nhưng Python local báo không có vnai.agents; runtime bundled chưa có vnai. Chưa có khóa Vnstock trong cấu hình local để kiểm tra cấp tài khoản trực tiếp. Phải hoàn tất cập nhật môi trường riêng, tải đúng skill và kiểm tra cấp trước khi thay collector tài chính.

## Cấu hình server

Lưu khóa local trong .env.ai/.env đã được ignore, production trong Render Environment. Không đặt khóa ở public/ hoặc gửi vào chat.

- AI_ROUTE_ANALYST: gemini hoặc groq; dự phòng vẫn chỉ dùng provider đã xác nhận miễn phí.
- TRACKER_AI_ANALYST_CONFIG: JSON tùy chọn cho weights, grades, sectorFactors, toolTimeoutMs, cacheMs.
- Mặc định weights: technical 0.4, fundamental 0.4, news 0.1, sector 0.1; tổng bằng một.
- Ngưỡng A 80, B 60; thời gian chờ công cụ 20 giây, cache nguồn một giờ. Gateway giữ hạn thời gian và trần token riêng.
- Provider/model dùng cấu hình sẵn có, không gán một tên model chưa kiểm tra trong tài khoản.
- Không bật billing hoặc tự thay gói dịch vụ.

## Giới hạn miễn phí đã đối chiếu ngày 27/10/2026

| Dịch vụ | Kết quả đối chiếu và ảnh hưởng |
|---|---|
| Gemini | Free Tier chỉ cho một số model; nội dung có thể dùng cải thiện sản phẩm. Quota thật xem AI Studio theo project/model; không lấy một con số docs làm quota tài khoản. |
| Workers Free | 100.000 request/ngày, CPU 10 ms/request, 50 subrequest/request, RAM 128 MB. Không chuyển Quant/Python nặng sang Worker trong bản này. |
| KV Free | 100.000 lượt đọc/ngày; 1.000 lượt ghi khác khóa/ngày; một lần ghi/giây cùng khóa. Bản này không dùng KV. |
| Workers AI | 10.000 Neurons/ngày miễn phí, một số model cần phương thức thanh toán. Chưa thêm provider này khi chưa kiểm tra model/tài khoản. |
| GitHub Actions | Repo Tracker hiện public; standard hosted runner có chế độ miễn phí. Chưa bật cron AI mới. |
| Vnstock | Quyền và quota thay theo cấp/tài khoản/chính sách; CI cần khóa. Cộng đồng có BCTC rút gọn. Chưa kiểm tra tài khoản thực của chủ ứng dụng. |

Nguồn chính thức:
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/rate-limits
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/kv/platform/limits/
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://docs.github.com/en/billing/concepts/product-billing/github-actions
- https://vnstocks.com/docs/vnstock/tham-khao/cap-quyen-va-gioi-han

Vnstock miễn phí hướng tới sử dụng cá nhân, học tập và nghiên cứu; phải kiểm tra giấy phép/quyền nguồn trước mục đích thương mại hoặc tái phân phối.

## Kiểm tra

Node >=22:

    node tools/check-scripts.cjs
    node --test tests/*.test.cjs
    node tools/audit-data.cjs

Trong sandbox Windows, nếu thư mục tạm hệ thống báo EPERM khi rename, dùng thư mục tạm bên trong workspace cho lần chạy thử:

    New-Item -ItemType Directory -Force work/test-tmp | Out-Null
    $env:TEMP=(Resolve-Path work/test-tmp).Path
    $env:TMP=$env:TEMP
    node --test tests/*.test.cjs

Kiểm thử mới bao phủ: định tuyến câu tổng quát, giữ luồng kỹ thuật/Backtest, điểm thiếu, cấu hình lỗi, hạng bịa, dữ liệu tài chính chỉ từ nguồn có cấu trúc, một lần tổng hợp, nguồn treo/lỗi, thông tin riêng tư, RSS cũ/trùng và SSE có đăng nhập.

## Nghiệm thu còn cần quyền và dữ liệu thật

- Xác nhận workspace Render để kiểm tra backend và secret hiện có, rồi chọn model miễn phí thật trong tài khoản. Chưa xác minh Gemini đầu cuối bằng khóa thật.
- Hoàn tất Vnstock skill/tier, chuẩn hóa BCTC có kỳ/đơn vị, nguồn/ngày công bố; đối chiếu vài mã trước khi mở chấm cơ bản/tổng.
- Chạy đầu cuối trên máy tính và điện thoại thật sau khi deploy.
- Telegram chưa triển khai/gửi trong bản này. Cần bot/chat_id, danh sách theo dõi và vùng mua do người dùng xác nhận. Không suy đoán vùng mua từ “gần pivot”, vì engine hiện hữu chỉ mô tả trạng thái kỹ thuật.
- Bản tin sáng và cảnh báo EOD cần được kết nối sau khi nguồn, danh sách theo dõi và kênh gửi được xác nhận; chưa có lịch gửi đang hoạt động.
- Chưa merge main hoặc đưa bản sửa lên production trong lượt chuẩn bị này.

## Hoàn tác

Tắt AI bằng TRACKER_AI_ENABLED=false. Nhánh sửa riêng giúp xem diff và revert commit này. Không hoàn tác snapshot thị trường hay thay đổi của tác vụ khác.


Kết quả kiểm tra local ngày 27/10/2026: toàn bộ 139 kiểm thử đạt; 27 script parse thành công. Thử luồng HPG với snapshot ngày 26/10/2026 lấy được tám tiêu đề tin mã và tám tiêu đề tin ngành; không có lượt gọi model thật. Audit nguồn loại 315 bar OHLCV không hợp lệ theo quy tắc engine hiện hữu. Trình duyệt tích hợp không truy cập được server local và chặn giao thức file, nên chưa xác nhận bố cục bằng trình duyệt/điện thoại thật; bản HTML xem trước dành cho người dùng mở trực tiếp.
