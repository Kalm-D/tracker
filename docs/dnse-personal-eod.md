# Hướng DNSE Lightspeed cá nhân — thay kế hoạch KBS công khai

Owner đã yêu cầu thay KBS bằng DNSE ngày 16/11/2026. Không cần xin duyệt code lại. Adapter DNSE trước đây đã được nghiệm thu R4 với nhóm 5 mã × 320 phiên; đây là bằng chứng khả thi kỹ thuật, không phải nghiệm thu toàn thị trường hiện tại.

## Phạm vi mới

Giữ frontend tại GitHub Pages để giữ origin và Watchlist. Pages chỉ chứa code, không chứa snapshot giá hoặc khóa. Job DNSE dùng Secrets và ghi snapshot vào bucket Supabase private `tracker-dnse-private`. Backend hiện có trả manifest/archive sau khi xác thực **Owner**. User/Admin không được đọc dữ liệu DNSE của chủ tài khoản, kể cả qua API nghiên cứu. Tài khoản, hồ sơ nghiên cứu, Watchlist không bị xóa.

Phiên bearer ngắn hạn chỉ giữ trong RAM của web để không phụ thuộc cookie bên thứ ba trên Safari. API kiểm tra Origin, phiên, CSRF, hạn mức và Owner; logout thu hồi phiên. Không lưu khóa DNSE hoặc service role vào frontend. Tải lại trang có thể cần đăng nhập lại.

Theo phạm vi dùng cá nhân của nguồn, không phát hành snapshot vào Pages/Git/artifact hoặc cung cấp cho tài khoản khác. Không gửi dữ liệu DNSE sang Gemini/Groq: model gateway bị vô hiệu hóa trong chế độ riêng; POST Research dùng AI ngoài trả 409. Screener/điểm/chart/Research Lab bằng engine không đổi. Đây là giới hạn nguồn hiện tại, không xóa báo cáo AI hoặc cấu hình khóa đã lưu.

## Đã nối trong code

- `dnse-private-eod.yml`: lịch 16:17 Việt Nam ngày giao dịch, khóa chung giữa scheduled/manual DNSE run, chỉ read contents, không có quyền deploy Pages hoặc upload artifact. Cờ `TRACKER_DNSE_EOD_ENABLED` mặc định tắt.
- `run-private-dnse-eod.cjs`: dùng nguyên adapter DNSE đã ghim, 320 phiên, 3,6 giây/mã, 3 retries; endpoint phải tường minh DNSE. Khôi phục baseline DNSE từ kho private, không trộn KBS/VCI. Exporter nay dùng cùng calendar/cutoff EOD cho DNSE và KBS. Không đổi normalizer hoặc công thức.
- Publisher mặc định vẫn KBS để giữ đường cũ. Chỉ đường private truyền `sourceProvider:DNSE`, không nới missing/invalid/lùi phiên. JSON/gzip/audit phải đồng nhất.
- Upload archive mới trước, đọc và kiểm tra hash lại, thay active manifest cuối cùng. Upload/validate lỗi trước bước cuối giữ active trước. Kho phải xác nhận private; không tự tạo bucket hoặc bật public.
- `PrivateMarket`: cache ngoài public, kiểm định hash/source/benchmark/cùng kỳ, không tự lấy GitHub snapshot. Thiếu nguồn giữ quant trước với cảnh báo; HTTP asset trả lỗi để frontend giữ dữ liệu đang xem.
- `production.cjs`: chế độ riêng nạp dữ liệu riêng trước bind; không có baseline riêng thì chặn khởi động. Static `/data` bị chặn. Chế độ cũ giữ nguyên khi flag chưa bật.
- Pages build hỗ trợ `dnse-owner-private` với backend HTTPS đã biết; policy đang deploy vẫn `personal-file-only`. Chưa đổi production.

## Cần trước khi bật thật

1. Probe mới đã đạt 16/11/2026: VNINDEX/MBB/FPT/PVS/ACV mỗi mã 320 phiên đến 16/11; danh mục nguồn 1.517 cổ phiếu. Lượt đầu dừng ở launcher thiếu đường dẫn Node, đã sửa và kiểm tra calendar khi PATH trống. Kết quả trong outputs/DNSE_PRIVATE_LIVE.json ở workspace; không commit giá thật/khóa. Không tái sử dụng khóa từ tiến trình đã thoát hoặc yêu cầu gửi qua chat.
2. Kiểm định DNSE toàn danh mục, phiên độc lập, khác biệt nguồn/đơn vị/điều chỉnh giá. Nhóm 5 mã không được làm bootstrap toàn thị trường. Mã mới/thiếu lịch sử có thể bị strict exporter chặn; không nới gate để chạy xanh.
3. Xác minh phí và hạn mức đang áp dụng cho tài khoản hiện có; chưa có chứng nhận API DNSE luôn 0đ. Không đăng ký gói trả phí hoặc tự bật billing.
4. Tạo/kiểm tra bucket private trên project đang có trong Free, audit storage.objects policies để anon và authenticated không có đường đọc bucket (private flag một mình chưa đủ), kiểm thử deny thật. Không sửa RLS/tạo bucket trong lượt triển khai code này.
5. Cấu hình Secrets DNSE/Supabase ở GitHub, service role ở backend; backend chỉ cần Supabase để đọc giá, không cần giữ khóa DNSE. Seed baseline DNSE toàn danh mục đã kiểm định qua hàm `upload`, rồi mới bật cờ lịch.
6. Deploy backend mode riêng với `TRACKER_MARKET_PRIVATE_DNSE=true`, `TRACKER_DNSE_CACHE_DIR` ngoài public, Origin `https://kalm-d.github.io`; test Owner/anon/Admin/User, logout và không lộ static. Sau đó đổi policy Pages sang `dnse-owner-private`, `sourceProvider:DNSE`, `publicMarketSnapshots:false`, `automaticEod:true`, `apiBase:https://tracker-ai-free.onrender.com` và deploy. Kiểm tra Safari thật, Watchlist, snapshot hash và lượt EOD tiếp theo.

## Giới hạn vận hành và rollback

Code/fixture tests không thay nghiệm thu trên cloud thật. Chưa có tài nguyên/billing mới trong lượt này. Cloud archive cũ chưa có job dọn; cần theo dõi dung lượng/quota và chính sách retention trước vận hành dài hạn, không mặc định Free vô hạn. Một writer workflow; không chạy upload thủ công cùng lúc với lịch. Không tự bootstrap khi HTTP 404.

Trước deploy phải giữ backup state tài khoản/nghiên cứu và commit/backend hiện hành. Nếu lỗi, tắt cờ EOD, phục hồi backend/Pages cùng policy cá nhân trước, giữ bucket private và dữ liệu đã lưu để đối chiếu. Không quay public snapshot DNSE khi rollback.
