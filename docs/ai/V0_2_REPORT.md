# Báo cáo v0.2 — Strategy & Risk Intelligence

Trạng thái: **Partial / chưa nghiệm thu toàn bộ**. Người dùng đã trực tiếp yêu cầu tiếp tục phiên bản kế tiếp ngày 26/10/2026; phạm vi hiện tại là v0.2. Điều này không biến các phần v0.1 còn thiếu thành đã hoàn thành.

## Đã triển khai

- Hai vai trò Strategy và Risk bằng code, nối vào Manager, lịch sử, trace và báo cáo.
- Swing/Breakout, Giá trị/Cổ tức và Hybrid với các trục riêng, kịch bản bất lợi/cơ sở/thuận lợi và điều kiện vô hiệu hóa.
- Vốn, tiền khả dụng, rủi ro phương án, tỷ trọng, lô, bước giá, chi phí hai chiều, thuế bán, trượt giá và thanh khoản.
- R:R ròng, số lượng theo giới hạn, kiểm tra vị thế/ngành, tổng các phương án và stress gap.
- P/E/P/B theo ba bộ giả định; phân biệt hoàn toàn số tự nhập và dữ kiện tài chính có provenance.
- Từ chối tự tạo mục tiêu hoặc coi stop là bảo đảm lỗ tối đa. Có thể Chờ/Tránh.
- Form và renderer độc lập trong Shadow DOM, tương thích lịch sử v0.1.
- Giữ thông tin vốn/danh mục trong phép tính code, không đưa các trường này vào evidence gửi model.
- Flag public vẫn false; không thay engine, data, CSV, exporter, workflow hoặc các tab.

## Kiểm thử

Kết quả cuối cục bộ: **63/63 PASS** (40 test hiện hữu và 23 test Strategy/Risk mới), kiểm tra cú pháp script và git diff --check đều đạt.

Toàn bộ bộ test gốc và AI trước đó vẫn được giữ. Test mới gồm phép tính tay, bước giá qua ngưỡng 10.000/50.000, các giới hạn vốn/holdings/ngành/volume, 250 bộ số kiểm tra bất biến, gap, R:R sau chi phí, thiếu mục tiêu, dữ liệu cũ, provenance/TTM/đơn vị/ngày công bố, nhiều mã, lịch sử và lọc thông tin vốn khỏi LLM.

Không dùng test fixture làm dữ liệu thật. Các test tài chính dùng canonical facts giả lập ghi rõ fixture; chưa phải bằng chứng kết nối BCTC thật.

Kiểm tra UI thật: đã chạy Swing MBB trên snapshot 23/10/2026 với bộ vốn/giá tự nhập để thử; báo cáo trả Chờ vì snapshot cũ và kỹ thuật chưa xác nhận, trong khi phép tính vị thế vẫn hiển thị đầy đủ. Định giá tự nhập hiển thị nhãn giả định. Kiểm tra desktop và viewport điện thoại; chưa nghiệm thu iPhone/Safari vật lý.

## Agent/API/chi phí

Data, Manager, Technical, Strategy, Risk và Critic đã thực thi code. Công cụ Fundamental vẫn bị chặn bởi môi trường SDK/metadata; API model thật chưa có key/model/quota được cấu hình. Không tuyên bố sáu hay tám model đã chạy.

Usage API model thật: 0 call, 0 token provider ghi nhận, không phát sinh phí API model. Không có số đo token của ChatGPT Work.

## Phần chưa hoàn tất

1. Chuẩn hóa nguồn BCTC thật, ngày công bố, đơn vị và kỳ EPS TTM/BVPS, đồng thời kiểm chứng chất lượng doanh nghiệp/cổ tức.
2. Nghiệm thu Strategy/Risk/Critic bằng model thật; hiện các kết quả mới là code có điều kiện và những nguồn đã có.
3. Cloudflare/backend cloud, dữ liệu mới liên tục, phân quyền nhiều tài khoản và triển khai qua HTTPS.
4. Đối chiếu đầy đủ quy chế 2026/ngoại lệ; hiện chỉ có quy ước mô phỏng được công bố.
5. iPhone vật lý, bàn phím ảo, Safari và các cấu hình cookie/hosting thực tế.

Chưa bắt đầu v0.3. Chưa merge main hoặc deploy production. Xem IMPLEMENTATION_PROGRESS.md cho nhánh/commit và cách tiếp tục.

## Git bàn giao

Mã được giữ cục bộ ở nhánh feature/tracker-ai-v0.2, commit code 009246d. Việc tải 22 tệp v0.2 lên repository công khai đang bị xét duyệt tự động chặn, cần xác nhận riêng. Chưa có PR hay kết quả GitHub CI cho v0.2; 63/63 PASS là kết quả cục bộ.
