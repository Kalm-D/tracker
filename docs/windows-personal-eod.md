# DNSE trên Windows → Tracker iPhone

Owner đã chọn Windows làm máy thu thập ngày 17/11/2026 sau khi GitHub/Render/Supabase không kết nối được DNSE. Chỉ thay nơi thu thập; frontend giữ origin GitHub Pages, kho giá Supabase private và backend kiểm tra Owner.

## Vận hành

- `tracker-tools/windows_dnse.py --setup`: Owner tự nhập hai khóa DNSE và Supabase service_role. Chỉ lưu ciphertext DPAPI CurrentUser tại `work/dnse-windows/credentials.dpapi`; thư mục hạn chế theo SID hiện tại. Không lưu mật khẩu Windows, không đưa khóa vào command line, Git, Pages hay log.
- Task `Tracker-DNSE-Personal-EOD`: 16:17 thứ Hai–Sáu theo múi giờ Windows hiện tại (máy đã kiểm tra GMT+7), thêm AtLogon và StartWhenAvailable; Interactive/Limited, IgnoreNew, retry hai lần cách 30 phút. Máy cần bật, đăng nhập Windows và có mạng. Không cài GitHub self-hosted runner.
- Worker có lock PID, cache theo phiên, kiểm tra lại ngày cuối khi resume, bỏ lượt đã công bố đúng phiên; lịch ngày nghỉ dùng chung Data Quality Layer. Không đổi công thức hoặc ngưỡng 210/252 và không forward-fill.
- Nhịp tuần tự tối đa 4 OHLC/giây, thấp hơn [hạn mức DNSE công bố 50.000/giờ, 100.000/ngày](https://developers.dnse.com.vn/docs/guide/ratelimits/). Giữ retry/rate-limit của SDK; không đặt lệnh hoặc bật dịch vụ có phí.
- Kiểm định trước upload, archive bất biến/readback trước active; giữ active + ba phiên bản rollback. Cache mới có `job.json` giữ bốn phiên; không tự dọn thư mục cũ chưa đánh dấu, có liên kết hoặc chứa tệp lạ/nghiên cứu người dùng.

## Độ phủ dữ liệu

`dnse-explicit-coverage-1` đi cùng `meta.coverage`: số đã thử/completed, kết quả từng mã (`ok`, `too_few_rows`, `empty`), ngày cuối/số bar và danh sách lịch sử giữ lại. Nguồn rỗng không tạo giá. Lỗi HTTP/auth/rate hoặc thiếu lượt thử không được biến thành kết quả rỗng. Lịch sử giữ lại phải bằng bản trước và có ngày cũ hơn snapshot; R1 vẫn chặn mã có giá bị lùi phiên.

Publisher mặc định KBS và DNSE không có hợp đồng này vẫn giữ gate cũ. Validator hợp đồng dùng chung giữa publish và đọc backend, không tạo công thức điểm mới. D2 chỉ tính mã đủ lịch sử/cùng kỳ như đã nghiệm thu; UI báo số mã rỗng, ngắn lịch sử và khác phiên.

Lượt đầu 17/11 tải 1.518 mã/chỉ số, 44 rỗng. Lỗi đã phát hiện/sửa: Python pipe dùng CP1252, provenance bị mất khi DataFrame rỗng, và resume giữ kết quả được tải quá sớm trước khi nguồn hoàn tất EOD. Không sửa ngày/giá để vượt gate VNINDEX.

## Phát hành và rollback

Baseline DNSE đầy đủ phải qua kiểm định và tồn tại trong bucket private trước khi bật `TRACKER_MARKET_PRIVATE_DNSE` trên Render. Backend live/xác thực Owner được kiểm tra trước khi đổi policy Pages sang `dnse-owner-private`. GitHub scheduler DNSE không bật khi Windows là writer.

Nếu lỗi, dừng/disable task Windows, giữ ciphertext và snapshot để điều tra; tắt mode mới và phục hồi commit/backend đã ghi trong báo cáo. Không xóa Watchlist, tài khoản/nghiên cứu hoặc chuyển snapshot DNSE sang public. Không vô hiệu hóa/tạo lại khóa qua agent; Owner tự thao tác khi cần đổi khóa.

## Hợp đồng cho AI/PWA

Đọc qua API market có phiên Owner, dùng manifest hash + tradingDate và `meta.coverage`/Data Quality. Không nhận service_role/DNSE key ở frontend, không lấy dữ liệu giá từ Git. AI ngoài hiện bị tắt trong mode DNSE riêng; không coi mode cá nhân là quyền phân phối dữ liệu. Không triển khai lại AI Research/PWA trong thay đổi này.
