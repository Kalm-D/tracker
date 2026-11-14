# Nguồn và ý nghĩa dữ liệu

## Snapshot hiện tại đã kiểm tra

- market.json.gz: Vnstock / KBS, isDemo=false; asOf=2026-10-23; 1.519 mã/chỉ số, 353.123 bar đầu vào.
- Engine hiện tại loại 315 bar không hợp lệ, giữ 352.808 bar. AI không sửa hoặc tự điền bar.
- SHA-256 nội dung giải nén: 5255f2f1e4e79184f1c461148528e40a151e1755ef2b54bb4e4f8247a3b8c4f8.
- VNINDEX có 320 phiên, từ 14/07/2025 đến 23/10/2026. Không suy ra lịch sử nhiều năm cho mọi mã.
- market.json dự phòng là DEMO, asOf=2026-07-17; AI từ chối. Không sửa file này trong nhánh AI.
- AI khóa snapshot server. Dữ liệu live-on-open hoặc CSV người dùng nhập trong frontend không được coi là cùng snapshot. Báo cáo có ngày/hash riêng để tránh đánh đồng.

## BCTC

Adapter gọi Finance(source='VCI', period='quarter') của Vnstock, lấy income_statement, balance_sheet, cash_flow và ratio. Giữ nguyên nhãn cột/đơn vị nguồn, tối đa 4 kỳ do SDK trả. Chưa xác minh ngày công bố nên không đủ điều kiện point-in-time hoặc định giá hồi tố. Không tự gán ngày lấy dữ liệu thành ngày công bố.

Thử ACB trong phiên này: BLOCKED. Vnstock đã có nhưng vnai khởi tạo thất bại vì runtime Python không xác định được thư mục home. Không tự chấp nhận điều khoản hoặc sửa thư mục người dùng để vượt qua lỗi. Cần người dùng khởi tạo SDK theo hướng dẫn và điều khoản hiện tại; sau đó kiểm tra quyền Community/CI và quota trên đúng máy chủ dự kiến.

Tài liệu tham chiếu: https://www.vnstocks.com/docs/vnstock-data/bao-cao-tai-chinh và https://github.com/thinh-vu/vnstock/blob/main/vnstock/explorer/vci/financial.py

## Tài liệu và tin tức

- Cho đọc HTTPS từ allowlist ngân hàng, HOSE/HNX/VSDC, NHNN, cơ quan thống kê và Fed. Host, IP trả về, redirect, định dạng, dung lượng và thời gian đều có kiểm tra. Các doanh nghiệp ngoài danh sách cần thêm host chính thức bằng thay đổi code được review.
- HTML bỏ script/style. PDF chỉ đọc văn bản, tối đa 5 MiB/30 trang/40.000 ký tự; PDF scan cần OCR, chưa triển khai. pypdf là phụ thuộc tùy chọn; chưa kiểm thử PDF thật trong phiên này.
- Google News RSS chỉ lưu tiêu đề, publisher và mốc tin. Không coi đây là xác minh nội dung bài gốc.
- Đã đọc thật công bố Fed https://www.federalreserve.gov/newsevents/pressreleases/monetary20240918a.htm và ghi hash. Việc tải được tài liệu không đồng nghĩa đã xác minh toàn bộ nội dung bằng AI.
- Ngày công bố văn bản chưa có bộ trích xuất được xác minh: publishedAt=null, hiển thị rõ chưa xác minh. Không đoán ngày từ URL.
