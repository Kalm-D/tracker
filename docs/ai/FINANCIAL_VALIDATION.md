# Kiểm chứng tài chính

1. B.prepare từ chối demo, xử lý bar lỗi theo đúng logic hiện tại.
2. B.snapshot thực hiện giới hạn ngày trước khi tính chỉ báo; AI không viết lại engine.
3. Metrics MBB/ACB/TCB được so với kết quả engine gọi trực tiếp: close, MA50/MA200, RSI2, RS, Tracker Score, pivot phải bằng nhau.
4. RSI trong engine được đọc theo tên trường thật (rsi2), không được gọi nhầm RSI14. Điểm RS/Tracker không phải xác suất tăng giá.
5. Các số liệu LLM đưa ra phải có trong nguồn được dẫn; ID nguồn không tồn tại hoặc số liệu mới bị từ chối. Không cho LLM tự tính định giá mới.
6. Critic so sánh câu có cấu trúc như “MBB hiện giá 1 đồng” với close snapshot và nêu mâu thuẫn, luôn kèm ngày snapshot.
7. Nguồn không có ngày công bố/đơn vị rõ ràng phải nêu giới hạn. Không sử dụng để backtest hoặc định giá point-in-time.

## Giới hạn thực sự

Kiểm tra số xuất hiện trong nguồn chỉ là rào chắn sơ bộ, chưa chứng minh đúng kỳ, đơn vị, quan hệ tử số/mẫu số hoặc tính trung thực của nguồn. Không gọi đây là xác minh toàn bộ tài chính. financialVerified luôn false trong v0.1 hiện tại.

Chưa chạy model thật, chưa chứng minh Critic LLM phản bác độc lập hoặc chất lượng phân tích/định giá. Kiểm tra model giả lập là test giao thức, không phải bằng chứng nghiên cứu thật.

Không tự đặt lệnh; không có kết nối broker. Những trường stop/target/risk còn trong output engine là dữ liệu của engine hiện hữu, không phải Strategy/Risk Agent mới.
