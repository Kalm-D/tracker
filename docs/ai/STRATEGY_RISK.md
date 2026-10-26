# Strategy & Risk v0.2

Version tính toán: strategy-risk-0.2.0. Quy ước mô phỏng: vn-stock-simulation-2026-10-26.
Không thay đổi Tracker Engine, Backtest Engine hoặc công thức cũ.

## Ba chiến lược độc lập

- Swing / Breakout: dùng pivot/stop hiện hữu nếu người dùng không nhập. Kiểm tra D0, xu hướng, thanh khoản, breakout với volume theo ngưỡng Engine.DEFAULTS và bối cảnh thị trường. Không tự tạo mục tiêu.
- Giá trị / Cổ tức: xét định giá và chất lượng doanh nghiệp riêng. Không lấy một stop giao dịch ngắn để làm điều kiện vô hiệu hóa đầu tư dài hạn; cần người dùng xác định. Chỉ số P/E/P/B thấp không chứng minh chất lượng lợi nhuận hoặc cổ tức bền vững.
- Hybrid: đồng thời kiểm tra các trục cơ bản và kỹ thuật; không cộng thành một điểm số cơ học.

Kết luận: Chờ, Tránh theo bộ tiêu chí hoặc Theo dõi có điều kiện. Không có trạng thái đặt lệnh. Dữ liệu cũ, thiếu mục tiêu, thiếu vốn hoặc thiếu BCTC có thể dẫn đến Chờ. Một job đã tính xong vẫn có thể kết luận Chờ; completed không phải xác nhận cơ hội đầu tư.

Hiện chưa có bộ kiểm chứng chất lượng doanh nghiệp/cổ tức bằng nguồn thật; Value/Hybrid giữ trạng thái Chờ. Đây là giới hạn nghiệm thu, không phải lỗi cần bỏ rào chắn.

## Quy mô vị thế

Giá vào và giá mua giả định sau trượt giá làm tròn lên bước giá. Stop, giá bán tại stop và mục tiêu sau trượt giá làm tròn xuống. Phí mua, phí bán và thuế bán được tính riêng. Chi phí mỗi cổ phiếu được làm tròn bất lợi đến 0,01 đồng.

    Rủi ro mỗi cổ phiếu = Chi phí mua mỗi cổ phiếu − Tiền bán ròng tại stop
    Lãi mục tiêu mỗi cổ phiếu = Tiền bán ròng tại mục tiêu − Chi phí mua mỗi cổ phiếu
    R:R = Lãi mục tiêu mỗi cổ phiếu / Rủi ro mỗi cổ phiếu

Số lượng là mức nhỏ nhất theo năm ràng buộc nếu đủ dữ liệu: ngân sách rủi ro, tiền khả dụng, tỷ trọng mã, công suất thanh khoản và tỷ trọng ngành. Mỗi mức được làm tròn xuống lô 100. Không dùng đòn bẩy. Nếu đã khai báo vị thế/ngành đang nắm mà thiếu tiền khả dụng, không giả định vốn còn trống.

Công suất thanh khoản = min(TB20, volume phiên cuối) × tỷ lệ tham gia giả định. Đây là công suất mô phỏng, không phải lượng khớp được bảo đảm ở phiên kế tiếp.

Stop không bảo đảm mức lỗ tối đa. Báo cáo thêm kịch bản giá gap dưới stop; chưa tính thời điểm được bán theo lịch và phân bổ thực của broker. Không thay quy tắc settlement của Backtest Engine cũ.

## Nhiều mã và danh mục

Giá/stop/target/EPS/BVPS hoặc giá trị vị thế/ngành tự nhập chỉ áp dụng một mã. Yêu cầu nhiều mã có các trường này bị chặn để tránh gán cùng một giả định sai cho nhiều cổ phiếu.

Các phương án không có giá tự nhập được tính riêng trên cùng vốn. Bảng tổng phát hiện vượt tiền, ngân sách rủi ro và tập trung ngành. Không tự tối ưu hoặc xem đây là danh mục đặt đồng thời. Tổng rủi ro phương án mới chưa bao gồm rủi ro các vị thế đang có.

## Định giá và ba kịch bản

Có P/E (EPS 12 tháng/niên độ năm) và P/B (BVPS). Bội số bất lợi/cơ sở/thuận lợi và biên an toàn do người dùng giả định, không gán xác suất.

EPS/BVPS tự nhập luôn là user_assumption, kể cả khi người dùng ghi tên một báo cáo trong ghi chú. Phép tính hiển thị “giá trị theo giả định”, không tự tạo điểm mua.

Dữ kiện reported chỉ được chấp nhận khi server có facts trỏ về trường số gốc trong tables, đúng ticker, đơn vị VND/share, kỳ thích hợp, snapshot hash, ngày công bố không sau ngày nghiên cứu, kỳ không sau ngày công bố và không quá 460 ngày. facts giả lập trong tests không được đưa vào dữ liệu sản phẩm.

Adapter Vnstock hiện chưa cung cấp đủ metadata ngày công bố/facts chuẩn hóa để nghiệm thu luồng thật. Không gán EPS quý thành EPS TTM, không tự đổi nghìn đồng thành đồng hoặc coi ngày thu thập là ngày công bố.

## Lưu và bảo mật

Mỗi job giữ cấu hình, version, ngày/hash snapshot, engine version và configurationHash. Lịch sử v0.1 vẫn đọc được.

Biểu mẫu vốn/danh mục được tính bằng code. Gateway loại vốn, giá trị đang nắm, số lượng vị thế và tổng lãi/lỗ cá nhân khỏi evidence gửi model; giữ R:R và phép tính trên mỗi cổ phiếu để diễn giải. Nội dung người dùng tự viết trong câu hỏi vẫn là nội dung gửi model khi API được cấu hình.

Chưa có mô hình AI thật đã chạy, chưa có backtest Agent v0.3 hoặc đặt lệnh.
