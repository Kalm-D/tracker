# Báo cáo v1.0 — Production Hardening

Ngày 26/10/2026. Version 1.0.0-rc.1. Trạng thái **Partial / release candidate cục bộ**. Yêu cầu “tiếp tục ver tiếp theo” cho phép thực hiện mốc v1.0 theo lộ trình gốc sau v0.3. Chưa có quyền công khai v0.3/v1.0, merge main hoặc triển khai production.

## Kết quả và phạm vi

| Hạng mục | Kết quả thực tế |
|---|---|
| 10 vai trò | Manager, Data, Technical, Fundamental, News, Strategy, Risk, Critic/Audit, Backtest, Monitoring; là module code, chưa phải 10 model đã nghiệm thu |
| Gateway/Router | Ưu tiên provider theo vai trò, kiểm tra danh mục model, cache, timeout/hủy, retry có giới hạn, fallback chỉ giữa provider đã xác nhận free |
| Token Manager | Sổ bền, giữ ngân sách trước API, trần RPM/TPM/RPD/TPD nội bộ, tổng usage thực được ghi khi có, cooldown; lỗi sổ hoặc cấu hình thì chặn API |
| Free Mode | Strict true, paid false, autotrading false; chưa tự xác minh billing/quota tài khoản |
| Vận hành | Màn hình owner: ngân sách, usage, trạng thái nghiệm thu, RAM/heap/event loop/dung lượng, job/monitor và sự kiện đã lọc |
| Bảo mật | Khóa một process/thư mục, chặn state trong public, kiểm tra liên kết đường dẫn, lọc lỗi upstream, body UTF-8 có giới hạn, HTTP timeout; giữ owner/cookie/CSRF/Origin |
| Lưu trữ/khôi phục | Giữ file hỏng để chẩn đoán, chặn ghi khi lưu lỗi; sao lưu offline có SHA256, restore thư mục mới và giữ API 24 giờ nếu khôi phục sổ token |
| UI | Vận hành tích hợp Shadow DOM, sửa focus trap và tràn ngang chuỗi hash; public flag vẫn false |
| Kiểm thử | 113/113 PASS cục bộ, 25 script parse; data audit và kiểm tra diff đạt |
| Production | Chưa deploy, chưa có cloud 24/7, chưa nghiệm thu model/BCTC/iPhone HTTPS |

## Tệp chính

Mới: server/ai/token-manager.cjs, server/ai/operations.cjs, public/ai/operations-ui.js, tools/ai-state.cjs, tests/production-hardening.test.cjs và tài liệu này/OPERATIONS.md.

Cập nhật: Gateway, Research, Monitoring, server API, contracts, Chat UI/CSS/config, hook index và .env.example. Không thêm dependency. Không thay engine public/shared, public/backtest, dữ liệu/CSV, exporter hoặc workflow hiện hữu.

Bộ công cụ của các vai trò giữ nguyên: engine Tracker/Backtest thật, adapter nguồn BCTC/tài liệu, code Strategy/Risk, worker Backtest và polling Monitoring. Không cấp shell, quyền đặt lệnh hay quyền tự chọn endpoint cho model. Chi tiết: AGENT_REGISTRY.md, ARCHITECTURE.md, TOKEN_MANAGEMENT.md.

## Bằng chứng kiểm chứng

81 test trước đó cộng 32 test hardening = **113 PASS, 0 fail, 0 skip**. Test provider dùng fixture có nhãn; không phải API acceptance. Bao phủ ngân sách bền/đồng thời, rollover và đổi model, usage/cooldown/retry/cache, lỗi sổ/khóa, bảo mật lỗi upstream, resource guard, backup/restore/checksum/traversal, shutdown/recovery và API owner/CSRF/UTF-8.

Audit giữ nguyên: 1.519 mã, 353.123 bar nguồn, 352.808 hợp lệ, 315 bị loại. Snapshot ngày 23/10/2026, SHA256 5255f2f1e4e79184f1c461148528e40a151e1755ef2b54bb4e4f8247a3b8c4f8. Đây không phải giá trực tiếp.

UI Quick MBB chạy bằng snapshot thật: close 19.800, MA50 19.952, RS 71, Tracker 51. Standard hiển thị thiếu model và giữ số liệu đã tính. Desktop và viewport 390×844 đã kiểm tra Vận hành, cuộn, không tràn ngang, focus trap. Chưa thử iPhone/Safari vật lý/bàn phím ảo.

## Giới hạn và điều kiện nghiệm thu

- Model: cần cấu hình riêng trên server GEMINI_API_KEY/GEMINI_MODEL/GEMINI_FREE_TIER_CONFIRMED hoặc GROQ_API_KEY/GROQ_MODEL/GROQ_FREE_TIER_CONFIRMED sau khi kiểm tra tài khoản miễn phí. Không gửi key vào chat. Chưa chạy nghiên cứu thật qua model, chưa kiểm tra prompt injection/model output thực.
- BCTC: còn thiếu runtime/điều khoản/nguồn thật với ngày công bố, TTM, đơn vị và dữ liệu cổ tức đã xác minh. Fixture không thay thế.
- Hạ tầng: chưa có tài khoản/runtime cloud được cấu hình và kiểm chứng hoạt động miễn phí 24/7. State hiện là filesystem một process; chưa D1/đa tài khoản/đồng bộ.
- Mobile: viewport chỉ là mô phỏng kích thước. Cần thử owner cookie, CSRF, history, cancel/retry và bàn phím trên iPhone/Safari qua HTTPS.
- Bảo mật: test code không thay thế pentest và đánh giá triển khai. Giới hạn tài nguyên chặn job mới, không bảo đảm process không vượt RAM.
- Backtest/Monitoring vẫn giữ các giới hạn đã ghi ở V0_3_REPORT.md; chưa có tự động giao dịch hoặc thông báo ngoài.

## Token, chi phí và bàn giao

Phiên triển khai: **0 lời gọi model thật, 0 token provider ghi nhận**; không bật billing hoặc mua credit. Token ChatGPT Work không có số đo trong phiên, không suy diễn thành 0. Trần nội bộ không phải quota thực còn lại.

Nhánh local feature/tracker-ai-v1.0-hardening, nền local v0.3 2e04eae. Preview http://127.0.0.1:8794/ chỉ có khi máy chủ chạy. Không dùng mật khẩu kiểm thử cho môi trường thật; tự chạy bằng tools/setup-ai.cjs theo DEPLOYMENT.md.

Website chính thức https://kalm-d.github.io/tracker/ chưa được thay đổi. Main đã kiểm tra vẫn ff375dde18660ff9f1d3eef1138c1905f6791add. v0.2 công khai ở PR nháp #12 https://github.com/Kalm-D/tracker/pull/12, CI https://github.com/Kalm-D/tracker/actions/runs/40278418597. Không có GitHub CI hoặc PR cho v1.0 để viện dẫn.

Bước tiếp theo là cấu hình và nghiệm thu các điều kiện thực còn thiếu, rồi trình kế hoạch triển khai cụ thể để được phê duyệt. Không tự chuyển sang phiên bản mới hay tự deploy.
