# Điểm danh QR và GPS

## Cấu hình dev

1. Tạo `.env.local` từ `.env.example` và tự thêm Mapbox **public token** (`pk…`) vào `VITE_MAPBOX_ACCESS_TOKEN`. Không dùng token bí mật `sk…` và không gửi token qua chat. Khởi động lại Vite sau khi sửa env.
2. Chạy `npm run emulators`, `npm run seed:emulator`, rồi `npm run dev`.
3. Đăng nhập nhanh tài khoản quản trị, mở mục **Điểm danh**, đặt tâm khuôn viên bằng cách bấm/kéo điểm trên bản đồ, nhập bán kính và sai số GPS tối đa (mét), rồi lưu.
4. Chọn lớp và buổi học, bấm **Bắt đầu**. QR được đổi mỗi 60 giây; kết thúc phiên sẽ vô hiệu hóa mã hiện tại ngay.
5. Đăng nhập tài khoản sinh viên thuộc lớp đó trên `/lich`, bấm **Quét QR điểm danh**, cho phép camera và vị trí. Trang cần HTTPS trên điện thoại; `localhost` được trình duyệt cho phép trên chính máy chạy dev.

Mapbox yêu cầu public access token. Giới hạn token theo URL các môi trường sử dụng và chỉ cấp quyền đọc bản đồ cần thiết.

### Mở app trên điện thoại cùng Wi‑Fi

Các lệnh mặc định chỉ bind `localhost`. Dừng các emulator/dev server đang chạy bằng `Ctrl+C`, rồi mở hai terminal:

1. Terminal 1: `npm run emulators:lan`. Lệnh này bind Auth và Firestore emulator vào IPv4 Wi‑Fi dev đang cấu hình trong `firebase.lan.json`; nếu cần nạp lại dữ liệu demo thì chạy thêm `npm run seed:emulator:lan`.
2. Terminal 2: `npm run dev:lan`.
3. Trên điện thoại cùng Wi‑Fi, mở `http://192.168.1.3:5173/admin/` hoặc `/lich/`. Thay IP trong `package.json` và `firebase.lan.json` nếu IPv4 Wi‑Fi của máy dev đổi; app tự dùng hostname của trang để kết nối tới Auth (`9099`) và Firestore (`8181`) emulator.
4. Nếu không mở được, Windows Defender Firewall có thể chặn inbound TCP `5173`, `9099`, `8181`. Wi‑Fi máy hiện đang được Windows phân loại là Public; chỉ cho phép các cổng này từ Local Subnet trên mạng tin cậy.

HTTP qua IP LAN có thể tải trang nhưng không phải secure context. Camera và GPS cần HTTPS trên điện thoại; để thử quét QR/GPS cần cấu hình HTTPS/tunnel tin cậy.

## Dữ liệu Firestore

- `attendance/config`: tâm geofence của khuôn viên, bán kính, ngưỡng sai số GPS và admin cấu hình.
- `attendance/current`: phiên đang mở (mỗi thời điểm một phiên), mã QR hiện hành và thời điểm hết hạn.
- `attendanceSessions/{sessionId}`: lịch sử các phiên.
- `attendanceRecords/{sessionId}_{email}`: một bản ghi mỗi sinh viên/buổi, kết quả GPS, accuracy, trạng thái và thông tin duyệt ngoại lệ.

Không lưu tọa độ GPS của sinh viên hoặc khoảng cách đo được. Trình duyệt chỉ giữ vị trí trong bộ nhớ để tính kết quả `inside`, `outside`, `poor_accuracy` hoặc `unavailable`, rồi gửi kết quả cùng accuracy. Với bản ghi bị từ chối, admin có thể cấp một lượt quét lại qua dialog riêng và bắt buộc ghi lý do; kết quả cũ được giữ trong `retryHistory`. Mỗi lượt thử lại đều cần được cấp quyền riêng.

### Trạng thái điểm danh trên lịch sinh viên

Lịch hiển thị trạng thái từ phiên mới nhất của từng buổi và bản ghi của chính sinh viên: chưa mở, đang mở, chưa điểm danh, có mặt, bị từ chối, ngoại lệ đã duyệt hoặc được phép điểm danh lại. Firestore Rules chỉ cho phép sinh viên đọc phiên thuộc lớp mình và bản ghi được lọc theo email cùng lớp của chính mình.

## Giới hạn bảo vệ

Ứng dụng hiện ghi trực tiếp từ trình duyệt vào Firestore, không có backend đáng tin cậy để xác minh vị trí. Rules kiểm tra đăng nhập, lớp, phiên đang mở, mã QR hiện tại, hạn mã, accuracy và bản ghi duy nhất; chúng không thể chứng minh rằng kết quả geofence do trình duyệt gửi là đúng. Người dùng có thể giả GPS hoặc chuyển tiếp QR. QR đổi mỗi phút làm giảm thời gian dùng lại ảnh chụp cũ, nhưng không ngăn chuyển tiếp mã đang hoạt động.

Không deploy `firestore.rules` lên Firebase thật trong quá trình dev. Vite ở môi trường dev luôn kết nối Firebase Emulator.
