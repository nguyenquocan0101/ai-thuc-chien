import { I18N, LANG, t, esc, pick } from "./i18n.js";
import { COURSE } from "./course.js";
import { firebaseConfig } from "../lib/firebase-config.js";
import { isAdminEmail } from "../lib/admins.js";

/* ===== Đăng ký: Google → thông tin sinh viên → cam kết ===== */
// Cấu hình ở src/lib/firebase-config.js. Để null thì trang dùng cửa sổ mô phỏng (bản xem trước, không gửi dữ liệu đi đâu).
const FIREBASE_CONFIG = firebaseConfig;
// SDK tách chunk riêng, nạp sẵn khi trang rảnh để bấm "Tiếp tục với Google" mở popup ngay (không bị chặn popup)
let fbMod = null;
const fb = () => fbMod ? Promise.resolve(fbMod) : import("../lib/firebase.js").then(m => (fbMod = m));
Object.assign(I18N.vi, {
  "r.title": "Đăng ký ngay", "r.ctaT": "Bạn là sinh viên IT và đang gặp khó khăn?", "r.ctaP": "Hai tuần cùng nhóm làm một ứng dụng web chạy thật, có AI code cùng. Đăng nhập bằng tài khoản Google bất kỳ để giữ chỗ.",
  "r.perk1": "6 bước thực hành", "r.perk2": "Làm ra sản phẩm chạy được", "r.perk3": "Chứng nhận khi hoàn thành",
  "r.close": "Đóng",
  "r.join": "Tham gia ngay",
  "r.eFail": "Đăng nhập chưa thành công, bạn thử lại nhé.",
  "r.verified": "Đã xác minh", "r.switch": "Đổi tài khoản", "r.major": "Ngành học",
  "r.mockTag": "Bản xem trước · mô phỏng Google", "r.mockT": "Chọn tài khoản để tiếp tục", "r.gmail": "Email Google", "r.cancel": "Hủy", "r.next": "Tiếp tục",
  "r.sumId": "MSSV", "r.sumMajor": "Ngành", "r.sumTerm": "Học kỳ",
  "r.idFromMail": "Gợi ý từ email trường, sửa lại nếu chưa đúng",
  "r.saving": "Đang lưu đăng ký…", "r.eSave": "Chưa lưu được đăng ký. Kiểm tra mạng rồi bấm gửi lại.",
});
Object.assign(I18N.en, {
  "r.title": "Register now", "r.ctaT": "An IT student who's feeling stuck?", "r.ctaP": "Two weeks building a working web app with your team and an AI coding agent. Sign in with any Google account to save your spot.",
  "r.perk1": "6 hands-on steps", "r.perk2": "Ship software that really runs", "r.perk3": "Certificate on completion",
  "r.close": "Close",
  "r.join": "Join now",
  "r.eFail": "Sign-in didn't go through. Please try again.",
  "r.verified": "Verified", "r.switch": "Switch account", "r.major": "Major",
  "r.mockTag": "Preview · simulated Google", "r.mockT": "Choose an account to continue", "r.gmail": "Google email", "r.cancel": "Cancel", "r.next": "Continue",
  "r.sumId": "Student ID", "r.sumMajor": "Major", "r.sumTerm": "Term",
  "r.idFromMail": "Suggested from your school email. Edit it if it's wrong",
  "r.saving": "Saving your registration…", "r.eSave": "Couldn't save your registration. Check your connection and submit again.",
});
export function initRegistration() {
  const $ = id => document.getElementById(id);
  const form = $("regForm"), dlg = $("regDlg"), paneI = $("rInfo"), done = $("done");
  const btn = $("submitBtn"), cPledge = $("c-pledge"), hint = $("submitHint"), gMock = $("gMock");
  const majorSel = $("f-major"), termSel = $("f-term");
  document.body.appendChild(gMock);
  let user = null;
  for (let i = 1; i <= 9; i++) { const o = document.createElement("option"); o.value = String(i); termSel.appendChild(o); }
  const labelTerms = () => [...termSel.options].slice(1).forEach(o => { o.textContent = t("f.termN") + o.value; });
  labelTerms(); addEventListener("langchange", labelTerms);
  // Thời gian học trên nhãn CTA lấy từ course.js; chưa có thì ẩn
  const ctaWhen = $("ctaWhen");
  const showWhen = () => { const p = pick(COURSE.period); ctaWhen.lastElementChild.textContent = p || ""; ctaWhen.hidden = !p; };
  showWhen(); addEventListener("langchange", showWhen);
  // Tên tài khoản FPT có đuôi khóa/cơ sở: "Nguyen Quoc An (K18 HCM)" → "Nguyen Quoc An"
  const shortName = n => String(n || "").replace(/\s*\([^)]*\)\s*$/, "").trim() || String(n || "").trim();

  // --- Firebase thật (chỉ chạy khi có FIREBASE_CONFIG) ---
  const fbSignIn = async () => {
    const { signInWithGoogle } = fbMod || await fb();
    const u = await signInWithGoogle();
    // Admin: giữ phiên đăng nhập và chuyển sang trang quản trị
    if (isAdminEmail(u.email)) { location.assign("/admin/"); return new Promise(() => {}); }
    return { uid: u.uid, name: u.displayName || u.email.split("@")[0], email: u.email, photo: u.photoURL };
  };
  // Đã đăng ký trước đó: điền lại form để sửa
  const prefill = async () => {
    try {
      const { getRegistration } = await fb(), r = await getRegistration(user.uid);
      if (!r) return;
      $("f-id").value = r.studentId || "";
      if (r.major) majorSel.value = r.major;
      if (r.term) termSel.value = String(r.term);
      setIdHint(r.studentId === suggestedId);
    } catch (x) { console.warn("prefill", x); }
  };
  // --- Bản xem trước: cửa sổ mô phỏng ---
  const mockSignIn = () => new Promise((ok, no) => {
    const nm = $("gm-name"), ml = $("gm-mail");
    gMock.hidden = false; document.body.classList.add("no-scroll"); setTimeout(() => nm.focus(), 30);
    const close = () => { gMock.hidden = true; document.body.classList.remove("no-scroll"); $("gmOk").onclick = $("gmCancel").onclick = null; };
    $("gmCancel").onclick = () => { close(); no("cancel"); };
    $("gmOk").onclick = () => { const e = ml.value.trim(); close(); if (!/^[^\s@]+@[^\s@]+$/.test(e)) return no("fail"); ok({ name: nm.value.trim() || e.split("@")[0], email: e, photo: "" }); };
  });

  const showPane = p => { [paneI, done].forEach(x => x.hidden = x !== p); };
  const openForm = () => { if (!dlg.open) dlg.showModal(); (paneI.hidden ? done : $("f-id")).focus(); };
  const renderAcct = () => {
    if (!user) return;
    $("acName").textContent = shortName(user.name); $("acMail").textContent = user.email;
    const av = $("acAv");
    av.textContent = (shortName(user.name).split(/\s+/).pop() || "?")[0].toUpperCase();
    if (user.photo) {
      // Ảnh Google (googleusercontent) từ chối request có Referer; lỗi thì giữ chữ cái đầu
      const img = new Image(); img.alt = ""; img.referrerPolicy = "no-referrer";
      img.onload = () => { if (user && user.photo === img.src) av.replaceChildren(img); };
      img.src = user.photo;
    }
  };
  const sync = () => { const ok = cPledge.checked; btn.disabled = !ok; hint.textContent = t(ok ? "f.hintOn" : "f.hintOff"); };
  // Trả về "ok" | "cancel" | "error"
  const signIn = async () => {
    const e = $("e-login"); e.textContent = ""; e.dataset.key = "";
    try { user = FIREBASE_CONFIG ? await fbSignIn() : await mockSignIn(); }
    catch (x) {
      if (x === "cancel" || x?.code === "auth/popup-closed-by-user" || x?.code === "auth/cancelled-popup-request") return "cancel";
      e.dataset.key = "r.eFail"; e.textContent = t(e.dataset.key); return "error";
    }
    renderAcct(); suggestId(); showPane(paneI); sync();
    if (FIREBASE_CONFIG) prefill();
    return "ok";
  };
  // Mọi nút Đăng ký: chưa đăng nhập thì mở Google ngay trong cú bấm (tránh chặn popup), xong mở popup form
  const start = async () => {
    if (user) { openForm(); return "ok"; }
    const r = await signIn();
    if (r === "ok") openForm();
    return r;
  };
  $("gBtn").addEventListener("click", start);
  const noMotion = matchMedia("(prefers-reduced-motion: reduce)");
  document.querySelectorAll('a[href="#dang-ky"]').forEach(a => a.addEventListener("click", async ev => {
    ev.preventDefault();
    // Lỗi đăng nhập hiện ở khu đăng ký, cuộn tới để sinh viên thấy
    if (await start() === "error") $("dang-ky").scrollIntoView({ behavior: noMotion.matches ? "auto" : "smooth", block: "center" });
  }));
  $("regClose").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); }); // bấm ra ngoài
  dlg.addEventListener("close", () => $("gBtn").focus({ preventScroll: true }));
  $("acSwitch").addEventListener("click", () => {
    if (FIREBASE_CONFIG) fb().then(m => m.signOutUser());
    if (idInput.value === suggestedId) { idInput.value = ""; setIdHint(false); }
    user = null; dlg.close();
  });

  addEventListener("keydown", e => { if (e.key === "Escape" && !gMock.hidden) $("gmCancel").click(); });
  cPledge.addEventListener("change", sync);

  const idInput = $("f-id"), idHint = $("h-id");
  // Mail trường có MSSV ở cuối phần trước @ (annqse183962@fpt.edu.vn → SE183962): điền sẵn, sinh viên vẫn sửa được.
  // Chỉ gợi ý với @fpt.edu.vn: mail khác (vd. Gmail) dễ khớp nhầm.
  let suggestedId = "";
  const setIdHint = on => { idHint.dataset.i18n = on ? "r.idFromMail" : "f.idHint"; idHint.textContent = t(idHint.dataset.i18n); };
  const suggestId = () => {
    if (idInput.value && idInput.value !== suggestedId) return; // sinh viên đã tự nhập
    const m = /([a-z]{2})(\d{6})@fpt\.edu\.vn$/i.exec(user.email);
    suggestedId = m ? (m[1] + m[2]).toUpperCase() : "";
    idInput.value = suggestedId; setIdHint(!!suggestedId);
  };
  idInput.addEventListener("input", () => {
    idInput.value = idInput.value.toUpperCase().replace(/\s/g, "");
    if (idInput.value !== suggestedId) setIdHint(false);
  });
  // select đã được bọc bởi dropdown dùng chung: .value và .focus() vẫn đi qua select gốc
  const fields = {
    id: { el: idInput, rule: v => /^[A-Z]{2}\d{6}$/.test(v.trim()) ? "" : "e.id" },
    major: { el: majorSel, rule: v => v ? "" : "e.major" },
    term: { el: termSel, rule: v => v ? "" : "e.term" },
  };
  const check = k => {
    const { el, rule } = fields[k], key = rule(el.value), box = el.closest(".field");
    box.classList.toggle("bad", !!key); el.setAttribute("aria-invalid", key ? "true" : "false");
    const er = $("e-" + k); er.textContent = key ? t(key) : ""; er.dataset.key = key; return !key;
  };
  const isBad = k => fields[k].el.closest(".field").classList.contains("bad");
  idInput.addEventListener("blur", () => { if (idInput.value) check("id"); });
  idInput.addEventListener("input", () => { if (isBad("id")) check("id"); });
  ["major", "term"].forEach(k => fields[k].el.addEventListener("change", () => { if (isBad(k)) check(k); }));
  const renderDone = () => {
    const last = shortName(user.name).split(/\s+/).pop();
    $("doneTitle").textContent = t("d.title")(last);
    $("doneText").innerHTML = t("d.text")(esc(user.email), pick(COURSE.resultDate) ? esc(pick(COURSE.resultDate)) : "");
    $("doneSum").innerHTML = [[t("r.sumId"), idInput.value], [t("r.sumMajor"), majorSel.selectedOptions[0]?.textContent || ""], [t("r.sumTerm"), t("f.termN") + termSel.value]].map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join("");
  };
  let saving = false;
  form.addEventListener("submit", async e => {
    e.preventDefault(); if (!user || saving) return;
    const keys = Object.keys(fields), bad = keys[keys.map(check).indexOf(false)];
    if (bad) { fields[bad].el.focus(); return; }
    if (FIREBASE_CONFIG) {
      saving = true; btn.disabled = true; hint.textContent = t("r.saving");
      try {
        const { saveRegistration } = await fb();
        await saveRegistration(user, { studentId: idInput.value.trim(), major: majorSel.value, term: termSel.value, pledge: true, lang: LANG });
      } catch (x) {
        console.error("saveRegistration", x); saving = false; sync(); hint.textContent = t("r.eSave"); return;
      }
      saving = false; sync();
    }
    renderDone(); showPane(done); done.focus();
  });
  $("againBtn").addEventListener("click", () => { showPane(paneI); sync(); idInput.focus(); });
  addEventListener("langchange", () => {
    sync(); document.querySelectorAll(".err").forEach(el => { if (el.dataset.key) el.textContent = t(el.dataset.key); });
    if (!done.hidden) renderDone();
  });
  sync();
  // Nạp sớm để nút Đăng ký ở header mở popup ngay trong cú bấm
  if (FIREBASE_CONFIG) (window.requestIdleCallback || (f => setTimeout(f, 300)))(() => fb().catch(x => console.warn("firebase preload", x)));
}
