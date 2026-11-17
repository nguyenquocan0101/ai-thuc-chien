import { I18N, t, pick } from "./i18n.js";
import { COURSE } from "./course.js";
import { firebaseConfig } from "../lib/firebase-config.js";

/* ===== Đăng ký đã đóng: sinh viên trong danh sách bấm một nút để đăng nhập Google rồi sang /lich xem lịch của mình =====
 * Mọi nút có data-signin (header, hero, khối CTA) là link tới /lich/. Khi SDK Firebase đã tải sẵn, bấm nút mở luôn
 * cửa sổ đăng nhập Google ở trang này; đăng nhập xong mới chuyển trang. Trang /lich tự kiểm tra email có trong danh sách. */
const LICH = "/lich/" + location.search; // giữ ?emu khi chạy thử với emulator
// SDK tách chunk riêng, nạp sẵn khi trang rảnh: cửa sổ đăng nhập phải mở ngay trong lúc bấm, chờ tải chunk thì trình duyệt chặn popup
let fbMod = null;

Object.assign(I18N.vi, {
  "r.ctaT": "Đã chốt danh sách. Xem lịch học của bạn",
  "r.ctaP": "Bạn có tên trong danh sách học viên? Đăng nhập Google bằng đúng email đã dùng để đăng ký để chọn buổi rảnh và xem lớp của mình.",
  "s.step1": "Đăng nhập bằng email đã đăng ký", "s.step2": "Chọn các buổi bạn rảnh khi lịch mở", "s.step3": "Xem lớp, buổi học và nhóm Zalo",
  "s.go": "Đăng nhập Google, xem lịch", "s.signing": "Đang chờ bạn đăng nhập…", "s.going": "Đang mở lịch học của bạn…",
});
Object.assign(I18N.en, {
  "r.ctaT": "The list is final. See your schedule",
  "r.ctaP": "On the participant list? Sign in with Google using the email you registered with to pick your free sessions and see your class.",
  "s.step1": "Sign in with your registered email", "s.step2": "Pick your free sessions when it opens", "s.step3": "See your class, sessions and Zalo group",
  "s.go": "Sign in with Google", "s.signing": "Waiting for you to sign in…", "s.going": "Opening your schedule…",
});

export function initScheduleCta() {
  const hint = document.getElementById("ctaHint");
  const setHint = key => { hint.dataset.key = key; hint.textContent = key ? t(key) : ""; };
  addEventListener("langchange", () => setHint(hint.dataset.key || ""));

  // Thời gian học trên nhãn CTA lấy từ course.js; chưa có thì ẩn
  const ctaWhen = document.getElementById("ctaWhen");
  const showWhen = () => { const p = pick(COURSE.period); ctaWhen.lastElementChild.textContent = p || ""; ctaWhen.hidden = !p; };
  showWhen(); addEventListener("langchange", showWhen);

  let user = null, busy = false;
  const go = () => { setHint("s.going"); location.href = LICH; };
  document.querySelectorAll("a[data-signin]").forEach(a => {
    a.href = LICH;
    a.addEventListener("click", async ev => {
      // Chưa có SDK (chưa tải xong hoặc cấu hình null): để link sang /lich, đăng nhập ở đó
      if (!fbMod || busy) { if (busy) ev.preventDefault(); return; }
      ev.preventDefault();
      if (user) return go();
      busy = true;
      a.setAttribute("aria-busy", "true");
      setHint("s.signing");
      try {
        await fbMod.signInWithGoogle();
        go();
      } catch (x) {
        a.removeAttribute("aria-busy");
        busy = false;
        setHint("");
        // Tự đóng cửa sổ thì thôi; lỗi khác (trình duyệt trong app chặn popup…) thì sang /lich thử lại ở đó
        if (x?.code !== "auth/popup-closed-by-user" && x?.code !== "auth/cancelled-popup-request") go();
      }
    });
  });

  if (firebaseConfig) {
    (window.requestIdleCallback || (f => setTimeout(f, 300)))(() =>
      import("../lib/firebase.js")
        .then(m => { fbMod = m; m.onUserChange(u => { user = u; }); })
        .catch(x => console.warn("firebase preload", x)));
  }
}
