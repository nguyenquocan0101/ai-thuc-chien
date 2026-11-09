# AI Thực Chiến – FA26

Landing page cho chương trình **AI-Augmented Software Engineering: From Requirements to Working Software** (FPT University). Trang tĩnh, một file HTML, deploy trên Vercel.

Bản đang chạy: https://ai-thuc-chien-ashen.vercel.app

## Cấu trúc

| Đường dẫn | Nội dung |
|---|---|
| `public/index.html` | Trang đã ghép, Vercel phục vụ trực tiếp |
| `public/config.js` | Cấu hình Firebase (`window.FIREBASE_CONFIG`) |
| `src/landing/index.html` | Khung trang gốc: header, FAQ, từ điển VI/EN, form cũ |
| `src/combo/*` | Phần ghép đè: hero 3D (`hero3d.js`), "Soi code AI" (`quiz.js`), chữ VI/EN (`copy.js`), form đăng ký (`reg.html`, `reg.js`), CSS (`combo.css`) |
| `src/build.py` | Ghép `src/` thành `public/index.html` |

## Sửa và build

```bash
cd src
python3 build.py   # ghi đè public/index.html
```

Sau đó commit cả `src/` và `public/`.

## Đăng nhập Google (Firebase)

1. Tạo project trên Firebase Console, bật **Authentication → Sign-in method → Google**.
2. **Project settings → Your apps → Web** để lấy `firebaseConfig`, dán vào `public/config.js`:
   ```js
   window.FIREBASE_CONFIG = { apiKey: "...", authDomain: "...", projectId: "...", appId: "..." };
   ```
3. **Authentication → Settings → Authorized domains**: thêm tên miền Vercel.

Khi `FIREBASE_CONFIG` là `null`, nút Google mở cửa sổ mô phỏng (bản xem trước). Chỉ tài khoản `@fpt.edu.vn` được đi tiếp. Thông tin đăng ký hiện chưa được lưu ở đâu.

## Thư viện ngoài

- three.js r128 (cdnjs), @real-human/liquid-glass 1.2.0 (jsdelivr)
- Logo công nghệ: Simple Icons 13.21.0 (CC0)
