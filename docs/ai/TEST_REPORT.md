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

## v0.3 — 26/10/2026

81/81 test cục bộ PASS (63 hiện hữu + 18 mới), 0 thất bại. tools/check-scripts: 24 script parse, không trùng khai báo global. git diff --check sạch. tools/audit-data: nguồn gzip thật, 1.519 mã, 353.123 bar nguồn, 352.808 hợp lệ, 315 bar bị loại như trước; VNINDEX 320 phiên. Không sửa nguồn để làm đẹp kết quả.

Đối chiếu worker và engine trực tiếp trên cùng snapshot/universe; kiểm tra hash race, demo, warmup, cancellation/timeout, request schema v3, lọc thông tin vốn; Monitoring persistence, source error, missing/stale, same-date revision, older snapshot, dedup, paused/deleted in-flight, retention/shutdown và owner/CSRF API. UI desktop + 390×844, lịch sử sau restart, tạo/kiểm tra/tạm dừng monitor; chưa có phiên mới thật hoặc Safari/iPhone vật lý để nghiệm thu. Xem V0_3_REPORT.md.

## v1.0 RC — 26/10/2026

113/113 PASS cục bộ (81 hiện hữu +32 mới), 0 fail/skip. 25 script parse. Test hardening kiểm tra durable quota/counters/rolling windows/migration/locks, actual usage và unknown usage, cooldown/retry/cache/routing/cancel, upstream error secrecy, malformed ledger/restore marker, resource limits/log whitelist, backup/restore/checksum/traversal/offline/stale PID, shutdown/corrupt history và API owner/CSRF/UTF-8. Fixture provider có nhãn, không có API model thật.

Audit data không đổi: 1.519 mã, 353.123 bar nguồn, 352.808 hợp lệ, 315 loại. UI Quick MBB dùng snapshot 23/10/2026; Standard báo thiếu model và giữ số liệu. Vận hành kiểm tra desktop và viewport 390×844, sửa tràn hash/focus trap. Lịch sử giữ qua restart. Chưa nghiệm thu physical iPhone/Safari/HTTPS, model/BCTC/cloud. Xem V1_0_REPORT.md.
