# Khắc phục báo cáo AI thiếu nội dung — 30/10/2026

## Nguyên nhân đã xác nhận

Báo cáo MSR Standard lúc 09:00:31 (UTC+7), job ebb36749-3454-476b-a335-31857444e4d9, có dữ liệu kỹ thuật và 8 tiêu đề doanh nghiệp + 8 tiêu đề ngành. Gemini chưa được gọi: quota nội bộ theo cửa sổ 24 giờ còn tính các lượt thử ngày trước. Đây không phải thông báo hết quota từ Google.

Ước tính cũ dùng số byte UTF-8 làm token và giữ toàn bộ ước tính sau cả phản hồi có usage thật. Các lượt timeout chưa biết usage vẫn phải giữ chỗ để bảo vệ hạn mức. Không xóa lịch sử hoặc sửa số liệu cũ để vượt hạn mức.

Render đang chỉ chạy kiểm tra JavaScript trong build; chưa cài thư viện Python BCTC. Adapter cũ lấy bốn dòng đầu trong khi vnstock 4.0.9 trả chỉ tiêu theo dòng và kỳ theo cột; vì vậy hầu hết chỉ tiêu bị mất. Một bảng lỗi cũng làm mất các bảng đã lấy được. Giao diện dùng chung thông báo thiếu dữ liệu cho mọi nguyên nhân.

## Thay đổi

- Dùng Gemini countTokens cho đúng nội dung gửi, cộng dự phòng schema và toàn bộ output tối đa trước khi giữ chỗ. Nếu đếm lỗi, giữ cách ước tính bảo thủ. Chỉ settle theo usage hợp lệ được provider trả; lỗi không rõ usage vẫn giữ chỗ. Trả mã lỗi, hạn mức và thời điểm có thể thử lại.
- Build tạo .venv-ai riêng, cài vnstock 4.0.9 và pypdf cố định phiên bản. Đọc từng bảng độc lập. Giữ mọi chỉ tiêu trong bốn quý gần nhất, hỗ trợ cả bảng chuyển vị, bảng dài và bảng rộng.
- Gửi chỉ tiêu chính cho model, ưu tiên tổng tài sản, nợ, vốn và dòng tiền; dữ liệu lịch sử quá cũ không dùng để nhận định hiện tại.
- Báo cáo có phần diễn giải và còn hạn chế được ghi nhận là hoàn thành một phần. Giao diện nêu đúng lỗi, hiển thị bảng BCTC và tin đã lấy kể cả khi AI bị chặn. Chỉ hiển thị điểm kỹ thuật thực sự có, không để các điểm tổng hợp chưa được tính thành ô trống.
- Đồng bộ snapshot đã kiểm tra từ main tối đa mỗi 30 phút, dùng ETag. Tải lỗi hoặc dữ liệu lùi ngày thì giữ bản tốt gần nhất và báo ngày đang dùng.

## Kiểm chứng

150 kiểm thử Node ban đầu đều đạt; bổ sung ca ưu tiên chỉ tiêu và loại ratio cũ cũng đạt. Bốn kiểm thử Python đạt. Kiểm tra cú pháp 27 scripts đạt. Audit snapshot 29/10 có 1.518 mã, loại 315 bar OHLCV không hợp lệ theo engine có sẵn.

Đọc nguồn MSR thật trên máy phát triển: 25 dòng kết quả kinh doanh, 122 dòng cân đối, 41 dòng dòng tiền cho Q3/2026, Q2/2026, Q1/2026, Q4/2025. Bảng ratio chỉ có năm 2018: phải ghi rõ lịch sử và loại khỏi input nhận định hiện tại. Nguồn chưa xác minh ngày công bố và đơn vị chung; không tự quy đổi hoặc coi là BCTC kiểm toán. Tin RSS vẫn chỉ là tiêu đề, chưa xác minh nội dung bài gốc.

CI bổ sung cài môi trường Python trên Linux và chạy fixture adapter. Phải đổi Build Command của dịch vụ Render hiện có sang bash tools/build-ai.sh; sửa render.yaml không tự cập nhật dịch vụ tạo thủ công. Nghiệm thu Gemini trên Render được ghi nhận sau triển khai, không suy ra từ fixture hoặc nguồn chạy cục bộ.

Giữ strict free, không bật thanh toán, không tự giao dịch, không đổi trần 80.000 và không đặt lại ledger.

## Nghiệm thu Render và sửa bộ kiểm tra toàn báo cáo

Bản 1.2.0 đã chạy trên Render (d758986, dep-dbi47t6h2hjs73bmrcl0). Build cần PYTHON_VERSION=3.12.16; mặc định 3.14.8 không khớp NumPy của vnstock. Giá trị này cũng được cố định bằng .python-version. Tám tệp trạng thái có checksum 40269a5ed235acb77265942f8f2da146 trước/sau chuyển máy chủ, lịch sử và ledger không đổi.

Ca MSR Standard 318f5a95-c0f2-41cf-8db4-b51800791d8e lúc 14:19 ngày 30/10 đã lấy đủ năm nhóm nguồn và gọi Gemini thành công: input 6.377 + output 699 = 7.076 token, giữ chỗ 11.272 rồi settle đúng usage. Bộ kiểm tra số liệu/nguồn đã từ chối cả phản hồi; bản gốc không lưu nên không thể kết luận chính xác câu nào bị từ chối.

Bản 1.2.1 lọc từng luận điểm bằng chính hợp đồng hiện có, giữ phần hợp lệ, loại riêng số/nguồn/hạng không khớp, kiểm tra lại toàn bộ kết quả cuối cùng. Tóm tắt sai chỉ được thay bằng nguyên văn luận điểm đã hợp lệ; không sửa số hoặc tự tạo nhận định. Thiếu luận điểm rủi ro hợp lệ hoặc không còn luận điểm nào thì vẫn chặn. Cảnh báo và số phần bị loại được lưu rõ, trạng thái hoàn thành một phần. Nội dung bị loại không được trình bày như nhận định hợp lệ. Khi đang chạy, giao diện dùng thông báo đang thu thập thay cho kết luận nguồn lỗi.

Câu hỏi tự nhiên có mã hoặc thị trường được đưa vào tổng hợp đầy đủ, không cần gõ đúng mẫu “Phân tích”. Quick kỹ thuật khi đã cấu hình model gọi một lượt diễn giải; khi chưa có model vẫn giữ phép tính code. Không đổi cách Backtest/Strategy Quick chạy bằng code.
