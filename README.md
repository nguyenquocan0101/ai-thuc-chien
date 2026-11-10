# AI Thực Chiến – FA26

Landing page cho chương trình **AI-Augmented Software Engineering: From Requirements to Working Software** (FPT University). Vite + JavaScript thuần, đăng ký ghi thẳng vào Firestore, deploy trên Vercel.

Bản đang chạy: https://ai-thuc-chien-ashen.vercel.app

## Chạy và build

Cần Node.js 20 trở lên.

```bash
npm install
npm run dev       # http://localhost:5173  (trang quản trị: /admin)
npm run build     # ra dist/
npm run preview   # chạy thử bản build
```

## Cấu trúc

| Đường dẫn | Nội dung |
|---|---|
| `index.html` | Trang landing: header, hero, chương trình, 6 chặng, form đăng ký, FAQ |
| `admin/index.html` | Trang `/admin`: danh sách sinh viên đã đăng ký |
| `src/main.js` | Điểm vào của landing, gọi các module theo đúng thứ tự |
| `src/admin.js` | Logic trang quản trị: đăng nhập, xem realtime, lọc, xuất CSV |
| `src/scripts/i18n.js` | Từ điển VI/EN, `applyLang()`, nút đổi ngôn ngữ |
| `src/scripts/course.js` | Thông tin chương trình (thời gian, phòng, hạn đăng ký…) |
| `src/scripts/registration.js` | Form đăng ký mở ngay trong khối CTA: email, họ tên, ngành, kỳ, cam kết → lưu Firestore (không cần đăng nhập) |
| `src/scripts/showcase/` | Hero 3D (`hero3d.js`), "Soi code AI" (`quiz.js`), chữ 6 chặng (`copy.js`) |
| `src/scripts/glass.js`, `reveal.js` | Tinh chỉnh liquid glass, hiệu ứng hiện dần |
| `src/lib/firebase.js` | Khởi tạo Firebase, ghi `registrations`, đăng nhập Google cho trang admin |
| `src/lib/firebase-config.js` | Cấu hình web của project `ai-thuc-chien-fa26` |
| `src/lib/admins.js` | Email được vào `/admin` (phải khớp `firestore.rules`) |
| `src/styles/` | CSS: `base.css`, `hero-stage.css`, `showcase.css`, `admin.css` |
| `firestore.rules`, `firebase.json`, `.firebaserc` | Luật bảo mật Firestore và cấu hình deploy |

## Firebase

Project: `ai-thuc-chien-fa26` (Firestore ở `asia-southeast1`).

Mỗi email có một document `registrations/{email}` (email viết thường). Các trường: `name`, `email`, `major`, `term`, `pledge`, `lang`, `createdAt`. Gửi lại cùng email sẽ bị từ chối, form báo "email đã đăng ký". Các đăng ký cũ (thời còn đăng nhập Google) nằm ở `registrations/{uid}` và có thêm `uid`, `studentId`, `updatedAt`.

`firestore.rules` bảo vệ dữ liệu:

- Ai cũng gửi được form, không cần đăng nhập, nhưng chỉ tạo mới được một lần cho mỗi email và không sửa được. Dữ liệu phải hợp lệ: email đúng dạng, ngành nằm trong danh sách, kỳ từ 1 đến 9, đã tick cam kết.
- Email không được xác minh, và form mở có thể bị spam bằng script. Nếu gặp spam, bật Firebase App Check.
- Chỉ email trong danh sách admin mới đọc được toàn bộ danh sách.

Thêm admin:

1. Sửa `src/lib/admins.js` và `firestore.rules`.
2. Chạy `npm run deploy:rules`.

Cài đặt một lần trên Firebase Console (CLI không làm được):

1. **Authentication → Get started → Sign-in method → Google → Enable** (trang admin đăng nhập bằng Google).
2. **Authentication → Settings → Authorized domains**: thêm `ai-thuc-chien-ashen.vercel.app` (và tên miền riêng nếu có). `localhost` đã có sẵn.

Đặt `firebaseConfig = null` trong `src/lib/firebase-config.js` thì form chạy thử: bấm gửi không lưu gì.

## Thư viện ngoài

- firebase (npm), three.js r128 (cdnjs), @real-human/liquid-glass 1.2.0 (jsdelivr)
- Logo công nghệ: Simple Icons 13.21.0 (CC0)
