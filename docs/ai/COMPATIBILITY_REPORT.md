# Kiểm tra tương thích v0.1 → v1.0

Ngày 26/10/2026. Người dùng cho phép tổng hợp, kiểm tra và đưa lên web chính thức nếu không có lỗi. Quyền triển khai đã có theo điều kiện; không cần hỏi lại quyền đó. Điều kiện bật AI production hiện **chưa đạt** do backend cloud/API chưa tồn tại trên web và model/BCTC/HTTPS chưa nghiệm thu.

## Kết quả

| Thành phần | Kết quả | Phạm vi |
|---|---|---|
| Tracker/Alpha Stock hiện hữu | PASS đối chiếu nguồn | Không sửa public/shared, public/backtest, public/data, tracker-tools hoặc workflow so với main ff375dde |
| v0.1 Research | PASS code | Request schema 1 và lịch sử được v1 đọc; dữ liệu kỹ thuật dùng nguyên engine |
| v0.2 Strategy/Risk | PASS code | Request schema 2, các giả định/chi phí/vị thế và dữ liệu riêng giữ theo hợp đồng |
| v0.3 Backtest/Monitoring | PASS code | Request schema 3; worker đối chiếu engine thật, monitoring persistence/dedup theo bộ test |
| v1.0 hardening | PASS code | Sổ quota, retry/cancel/fallback, owner/CSRF, tài nguyên và backup/restore |
| History hỗn hợp | PASS API | Schema 1/2/3 đọc lại nguyên request/report/version; job đang chạy chuyển blocked, không tự gọi model |
| Ledger cũ → v1 | PASS test | Giữ ngân sách cũ, migrate thận trọng theo provider |
| Ledger v1 → code cũ | Không tương thích ngược | Không trỏ v0.3 vào ledger v1. Rollback theo OPERATIONS.md, giữ ngân sách/hold |
| Desktop / viewport 390×844 | PASS luồng đã thử | Dashboard AI, lịch sử/kết quả Quick và Vận hành không tràn ngang; chưa iPhone/Safari vật lý |
| Backend web chính thức | BLOCKED | /tracker/api/ai/session trả 404; chưa có backend cloud HTTPS để cấu hình apiBase |
| Model/BCTC thật | NOT ACCEPTED | Không có call model thật; nguồn BCTC chuẩn hóa chưa nghiệm thu |

## Bằng chứng

Bộ test tổng hợp: 115/115 PASS cục bộ, 0 fail/skip (113 hiện hữu +2 kiểm thử tương thích). 25 scripts parse, audit snapshot thật và diff check đạt. Fixture request trong tests/fixtures/ai-version-requests.json được tạo từ code hợp đồng tại cdfa354, 423f6c0, af27e00; ghi full SHA và có nhãn dữ liệu kiểm thử. Không phải nghiên cứu hoặc output model thật.

Nguồn thị trường không đổi: 1.519 mã, 353.123 bar nguồn, 352.808 hợp lệ, 315 loại; snapshot 23/10/2026, hash 5255f2f1e4e79184f1c461148528e40a151e1755ef2b54bb4e4f8247a3b8c4f8. Không phải giá hiện tại.

Web https://kalm-d.github.io/tracker/ trả 200. Endpoint AI và ai/config.js trả 404 tại lần kiểm tra này. Workflow Pages chỉ xuất thư mục public; không chạy server/ai/server.cjs, Python hoặc worker Node. Đưa source lên Pages không làm các API này hoạt động.

## Quyết định triển khai

Chuẩn bị nhánh/PR tổng hợp để kiểm thử GitHub CI. Chưa merge main hoặc bật flag AI vì chưa có backend đáp ứng. Giữ website chính thức hiện tại hoạt động. Không báo “AI đã lên web” khi chỉ tải mã nguồn lên GitHub.

Để triển khai đầy đủ cần backend Node HTTPS có state bền và giới hạn/chi phí đã xác nhận, owner thật cấu hình riêng, model/key/free confirmation lưu server, nguồn BCTC thật và nghiệm thu kết nối Pages/HTTPS/iPhone. Không đưa key vào chat, public hoặc git. Không dùng localhost/tunnel tạm thời làm dịch vụ 24/7.

Không có vấn đề merge nền hiện tại: main vẫn ff375dde18660ff9f1d3eef1138c1905f6791add, cũng là tổ tiên của chuỗi phiên bản. Các PR cũ #11/#12 là các mốc riêng; không merge chồng từng PR vào main nếu sau này đã merge PR tổng hợp.

## Kết quả tải nhánh tổng hợp

Đã thử tạo Git tree trên Kalm-D/tracker để chuẩn bị PR. Hệ thống xét duyệt tự động từ chối trước khi tạo: quyền công khai mã nguồn v1.0 chưa rõ khi điều kiện production còn thiếu. Chưa có nhánh/PR/CI v1.0 mới. Không thử đường vòng. Cần người dùng xác nhận riêng việc công khai nhánh nguồn để tiếp tục CI; quyền triển khai theo điều kiện đã có, nhưng backend hiện chưa sẵn sàng. Commit kiểm tra local a5ff969.
