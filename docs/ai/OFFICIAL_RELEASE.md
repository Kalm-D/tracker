# Tracker AI Analyst trên web chính thức — 29/10/2026

## Cách mở

1. Vào [Tracker](https://kalm-d.github.io/tracker/).
2. Bấm **Nghiên cứu AI** để mở trợ lý, hoặc bấm nút **AI** ở dòng cổ phiếu để mang mã đã chọn sang trợ lý.
3. Trợ lý mở trong tab HTTPS riêng tại Render để đăng nhập trực tiếp, tránh phụ thuộc cookie giữa hai website trên điện thoại.
4. Mã và câu hỏi được điền sẵn khi dùng nút theo mã; chỉ bấm **Bắt đầu nghiên cứu** khi muốn gửi một lượt mới.
5. Bấm **Lịch sử** để mở báo cáo đã lưu. Việc xem báo cáo cũ không gọi lại Gemini.

## Bản đã kiểm thử

Backend đang chạy AI Analyst 1.1.1, Gemini 3.5 Flash-Lite. Lần thử HPG thật ngày 29/10 hoàn tất trong khoảng 15 giây, cached=false, API ghi nhận 2.858 token đầu vào và 713 token đầu ra. Audit cấu trúc, ID nguồn và số liệu đạt; đã mở lại báo cáo đã lưu từ Supabase.

Bộ mã AI có 143 kiểm thử đạt và 27 script parse. Kiểm tra mở từ Pages chỉ thao tác giao diện và truyền mã, không sinh thêm báo cáo hoặc thay ledger. Snapshot đã hợp nhất từ main ngày 28/10/2026; công thức Tracker và Backtest giữ nguyên.

## Phạm vi còn thiếu

BCTC có kỳ/đơn vị/ngày công bố và quyền nguồn Vnstock chưa nghiệm thu. Điểm cơ bản/tin/ngành/tổng/hạng vẫn trống khi thiếu dữ liệu. Nhãn **Còn phần bị chặn** trên báo cáo HPG phản ánh phần BCTC thiếu, trong khi nhận định Gemini đã có. RSS chỉ để phát hiện tin; kiểm tra số liệu xuất hiện trong nguồn chưa xác minh độc lập ý nghĩa hoặc kỳ báo cáo. Telegram, bản tin sáng/EOD, vòng gọi công cụ tự chủ và iPhone/Safari vật lý chưa nghiệm thu đầy đủ.

## Vận hành

Giữ khóa API và hash mật khẩu ở backend; không có secret trong cấu hình Pages. Strict Free Mode tiếp tục bật. Người dùng đã cho phép nâng AI_MAX_DAILY_TOKENS và GEMINI_MAX_TPD lên 80.000 để thử một báo cáo Flash-Lite; sau lần thử ledger giữ 70.582 token ước tính, bốn lượt và usage API xác nhận 3.571 token. Không đặt lại quota hoặc bật billing.

Render Free có thể ngủ khi không dùng. Sau khi tiến trình khởi động lại cần đăng nhập lại. Backend đang live commit 0f3b5a4; các thay đổi xuất bản Pages chỉ cập nhật launcher, tài liệu và giao diện công khai. Render vẫn liên kết nhánh feature/tracker-ai-v1-free-cloud, auto-deploy tắt: khi cần cập nhật backend phải chọn commit đã kiểm tra, đồng thời chuyển lease ghi độc quyền có kiểm soát. Không dùng Deploy latest commit từ nhánh cũ.

Tham khảo [PR 14](https://github.com/Kalm-D/tracker/pull/14) và [hướng dẫn cấu hình AI Analyst](MASTER_PROMPT_UPGRADE.md).
