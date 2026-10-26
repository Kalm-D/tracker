# Báo cáo kiểm thử 26/10/2026

Version: 0.1 — **Partial, chưa nghiệm thu**.

## Kiểm thử tự động

19 test Tracker gốc: PASS. 21 test AI mới: PASS. Gồm đối chiếu engine MBB/ACB/TCB bằng snapshot thật, từ chối DEMO thật, dữ liệu tương lai, số liệu/citation sai, hợp đồng JSON, URL/redirect/private IP, đọc HTML, giới hạn PDF qua parser fixture, RSS fixture, free mode, danh mục model, cache, ngân sách, HTTP 429, login/cookie/CSRF/Origin, lịch sử, hủy, restart và phản biện giá sai.

Provider fixture chỉ dùng trong tests/ai.test.cjs, không được trả cho người dùng làm dữ liệu thật. Không có model thật đã chạy.

## Kiểm tra thật / UI

| Ca nghiệm thu | Kết quả | Bằng chứng/giới hạn |
|---|---|---|
| Kỹ thuật MBB | PASS | Chạy trên UI bằng snapshot thật 23/10, close 19.800, MA50 19.952, RS 71, Tracker 51; là dữ liệu ngày đó, không là báo giá hiện tại |
| BCTC ACB | BLOCKED | SDK Vnstock/vnai không khởi tạo trong runtime Python; UI hiển thị thiếu nguồn, không bịa báo cáo |
| So sánh MBB/TCB | BLOCKED cho cơ bản/AI | Metrics engine thật có đối chiếu tự động; chưa có BCTC/model thật để nghiệm thu so sánh |
| Công bố có thật | Truy xuất PASS, phân tích AI BLOCKED | Đọc công bố Fed 18/09/2024, 11.088 ký tự sau loại HTML; không có key để phân tích model |
| RSS | Truy xuất PASS | Lấy 8 tin; nhãn headlines_only_not_verified |
| Luận điểm “MBB hiện giá 1 đồng” | PASS phạm vi code | UI phản bác so với snapshot 23/10; không suy ra giá trực tiếp |
| Rò API key | PASS trong phạm vi test/source review | Frontend không có provider key; chưa pentest production |
| Desktop | PASS luồng đã thử | Login, nghiên cứu, lỗi nguồn, đóng/mở, context từ Research Lab |
| iPhone 390×844 | PASS viewport | Chat vừa màn hình, không tràn ngang; chưa thử iPhone/Safari vật lý hoặc bàn phím ảo |
| CSS với theme Tracker | PASS sau sửa | Shadow DOM ngăn style dark theme làm chìm chữ |
| PDF thật | NOT RUN | Chưa có pypdf và chưa nghiệm thu PDF scan/OCR |
| Gemini/Groq thật | NOT RUN | Chưa có key/model/quota |
| Cloudflare/D1/Workflows | NOT RUN | Chưa cấu hình/deploy |

Không thay đổi snapshot, engine, công thức, exporter hoặc workflow. Feature Flag trên Pages vẫn tắt. Cần nghiệm thu lại các ca blocked sau cấu hình thật; không coi PASS giao thức giả lập là nghiên cứu AI đã hoàn thành.

## Bổ sung v0.2 ngày 26/10/2026

63/63 test PASS sau thay đổi Strategy/Risk (40 test đã có +23 mới), script parse và diff check đạt. Xem V0_2_REPORT.md và STRATEGY_RISK.md cho phạm vi/giới hạn. Đây là test code và UI; chưa có model/BCTC/cloud thật đã nghiệm thu.
