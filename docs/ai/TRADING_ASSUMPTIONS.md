# Quy ước giao dịch dùng cho mô phỏng v0.2

Đây là cấu hình cho cổ phiếu thường, không phải API xác nhận một lệnh hợp lệ tại thời điểm hiện tại.

| Thị trường | Bước giá mô phỏng | Lô chẵn mô phỏng |
|---|---|---|
| HOSE | dưới 10.000: 10đ; 10.000 đến dưới 50.000: 50đ; từ 50.000: 100đ | 100 |
| HNX | 100đ | 100 |
| UPCoM | 100đ | 100 |

Không áp dụng cho ETF, chứng quyền, trái phiếu hoặc lô lẻ. Không suy ra giá trần/sàn khi thiếu giá tham chiếu, trạng thái hạn chế giao dịch, ngày đầu tiên hoặc ngày thực hiện quyền. Chưa tính lịch nhận chứng khoán hoặc tự cho phép bán trước khi khả dụng.

Mặc định người dùng xem/xác nhận được: phí 0,15% mỗi chiều, thuế bán giả định 0,1%, trượt giá 0,1%, tham gia thanh khoản 1%, rủi ro phương án 1% vốn, tỷ trọng mã 20%, ngành 35%, R:R tối thiểu 2, gap stress 10% dưới stop. Đây là các giả định cấu hình, không phải báo phí hiện hành hoặc khuyến nghị phù hợp cho mọi người.

## Tài liệu đã đối chiếu 26/10/2026

- VNX, danh mục quy chế chính thức: https://vnx.vn/vi/van-ban-phap-ly/6 — hiển thị Quyết định 22/QĐ-HĐTV ngày 16/03/2026 và 23/QĐ-HĐTV ngày 18/03/2026.
- Tệp quy chế VNX được liệt kê nhưng bản tải qua công cụ nghiên cứu vượt giới hạn dung lượng; chưa đối chiếu toàn văn/ngoại lệ 2026. Không gọi cấu hình mô phỏng là xác minh pháp lý đầy đủ.
- SSI, hướng dẫn giao dịch HNX của broker: https://www.ssi.com.vn/khach-hang-ca-nhan/quy-dinh-giao-dich-tai-hnx — ghi lô 100, bước giá cổ phiếu khớp lệnh 100đ và thời điểm thanh toán T+2. Không dùng hướng dẫn này để suy ra mọi broker/phiên đặc biệt.
- Bảng đơn vị yết giá HOSE do HOSE công bố (2016): https://staticfile.hsx.vn/Uploads/LocalFiles/7224f772fb924fe2af4b3536a5fb6018/20160909_20160905_Don%20vi%20giao%20dich%2C%20don%20vi%20yet%20gia%20092016.pdf — chỉ tham chiếu bảng bước giá; đơn vị lô trong tài liệu cũ không được dùng cho cấu hình lô hiện nay.

Trước production cần đối chiếu quy chế đang hiệu lực, các ngoại lệ và broker thực tế. v0.2 chỉ tính phương án nghiên cứu với executionReady=false.
