# Tiến độ Tracker Multi-AI — v0.2

Ngày 26/10/2026, người dùng trực tiếp yêu cầu “tiếp tục với ver kế tiếp”. Phiên bản hiện được phép: **v0.2**.
Trạng thái: **Partial / chưa nghiệm thu toàn bộ**. v0.1 còn các phần API/BCTC/cloud chưa hoàn tất, được giữ rõ trong báo cáo.

Nhánh làm việc: feature/tracker-ai-v0.2.
Commit nền v0.1: cdfa3541bb2048a4720323c536b275ebecd00e08 trên feature/tracker-multi-ai.
PR v0.1: https://github.com/Kalm-D/tracker/pull/11 — chưa merge.

## Đã có

Đủ 8 vai trò module của v0.1/v0.2. Strategy/Risk bằng code, ba chiến lược độc lập, phép tính vốn/lô/bước giá/phí/thuế/slippage/thanh khoản/ngành/R:R, stress gap, P/E/P/B ba kịch bản, nguồn và cấu hình có version/hash, giao diện nhập giả định và báo cáo, giữ lịch sử trước đó.

Code/data/engine cũ, CSV, exporter, workflow và tab Tracker được giữ nguyên. Chỉ thêm hook script UI chiến lược trong index. Public Feature Flag vẫn tắt.

## Tiếp tục đúng phạm vi

1. Xem git status/log, báo cáo V0_2_REPORT.md và kết quả test cuối.
2. Cấu hình secret API model trên đúng máy chủ; không gửi key trong chat. Chưa có model thật đã chạy.
3. Khắc phục Vnstock/runtime theo thiết lập/điều khoản chính thức. Chuẩn hóa kỳ TTM, BVPS, ngày công bố và unit, rồi kiểm chứng chất lượng doanh nghiệp/cổ tức. Không biến facts test hoặc EPS tự nhập thành BCTC đã xác minh.
4. Chạy nghiệm thu thật cho Strategy, Risk và Critic, giữ kết luận Chờ khi chưa đủ điều kiện.
5. Hoàn thiện backend cloud miễn phí hợp lệ, Cloudflare/D1 và kiểm thử Safari/iPhone thật. Chưa có staging cloud/production.
6. Chỉ sau báo cáo v0.2 mới xin phê duyệt v0.3; không tự triển khai Backtest/Monitoring Agent.

## Kiểm thử cần dùng

    node tools/check-scripts.cjs
    node --test tests/*.test.cjs
    node tools/audit-data.cjs

Cần đủ lịch sử git cho test engine tại commit 007e5c36. Các test mới dùng dữ liệu giả lập có nhãn chỉ để kiểm tra code, cùng kiểm tra Engine trên snapshot thật. Không có phí model API phát sinh.

## Cách xem

Bản preview trong phiên phát triển v0.2: http://127.0.0.1:8792/ trên máy hiện tại. Mật khẩu thử chỉ tồn tại trong tiến trình, không commit. Để tự chạy lâu dài, dùng tools/setup-ai.cjs và .env.ai như DEPLOYMENT.md; đổi cổng nếu 8790 đang được một preview khác dùng.

Không merge main, không deploy website chính thức, không bật billing hoặc tự bắt đầu v0.3.

## Trạng thái công bố v0.2

Mã v0.2 đã lưu trong commit cục bộ 009246df44e3646bb8166ebefe9c535c941a75cc (22 tệp thay đổi). Nhánh remote feature/tracker-ai-v0.2 mới được tạo tại commit nền, chưa chứa mã mới. Lần tải source bằng GitHub create_tree bị xét duyệt tự động từ chối vì chưa có xác nhận công khai riêng cho payload 22 tệp v0.2; xác nhận trước chỉ áp dụng 27 tệp v0.1. Chưa tạo PR v0.2, chưa chạy GitHub CI v0.2. Cần người dùng xác nhận payload/destination trước khi thử lại; không dùng phương thức khác để vượt chặn.
