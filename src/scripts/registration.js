import { I18N, LANG, t, esc, pick } from "./i18n.js";
import { COURSE } from "./course.js";
import { firebaseConfig } from "../lib/firebase-config.js";

/* ===== Đăng ký: Google (@fpt.edu.vn) → thông tin sinh viên → cam kết ===== */
// Cấu hình ở src/lib/firebase-config.js. Để null thì trang dùng cửa sổ mô phỏng (bản xem trước, không gửi dữ liệu đi đâu).
const FIREBASE_CONFIG = firebaseConfig;
// SDK tách chunk riêng, nạp sẵn khi trang rảnh để bấm "Tiếp tục với Google" mở popup ngay (không bị chặn popup)
let fbMod = null;
const fb = () => fbMod ? Promise.resolve(fbMod) : import("../lib/firebase.js").then(m => (fbMod = m));
const SCHOOL_DOMAIN = "fpt.edu.vn";
Object.assign(I18N.vi, {
  "r.title": "Đăng ký ngay", "r.lead": "Miễn phí cho sinh viên FPT khối IT. Đăng nhập bằng tài khoản Google @fpt.edu.vn để bắt đầu.",
  "r.s1": "Đăng nhập Google", "r.s1d": "Chỉ nhận tài khoản @fpt.edu.vn",
  "r.s2": "Thông tin sinh viên", "r.s2d": "MSSV, ngành học, học kỳ hiện tại",
  "r.s3": "Cam kết tham gia", "r.s3d": "Đọc điều lệ và xác nhận",
  "r.k1": "Bước 1/3", "r.loginT": "Đăng nhập bằng mail trường", "r.loginP": "Dùng tài khoản Google @fpt.edu.vn để ban tổ chức xác nhận bạn là sinh viên FPT.",
  "r.google": "Tiếp tục với Google",
  "r.eDomain": "Tài khoản này không phải mail trường. Hãy đăng nhập bằng email @fpt.edu.vn.", "r.eFail": "Đăng nhập chưa thành công, bạn thử lại nhé.",
  "r.verified": "Đã xác minh", "r.switch": "Đổi tài khoản", "r.major": "Ngành học",
  "r.rulesOpen": "Bấm để đọc 5 điều lệ trước khi xác nhận", "r.rulesRead": "Đã đọc", "r.rulesMob": "Mở trang điều lệ",
  "r.hintRead": "Đọc điều lệ Cam kết tham gia để mở ô xác nhận.",
  "r.back": "Quay lại form", "r.agree": "Tôi đã đọc, quay lại form",
  "r.mockTag": "Bản xem trước · mô phỏng Google", "r.mockT": "Chọn tài khoản để tiếp tục", "r.gmail": "Email Google", "r.cancel": "Hủy", "r.next": "Tiếp tục",
  "r.sumId": "MSSV", "r.sumMajor": "Ngành", "r.sumTerm": "Học kỳ",
  "r.idFromMail": "Gợi ý từ email trường, sửa lại nếu chưa đúng", "r.idChip": "Từ email",
  "r.saving": "Đang lưu đăng ký…", "r.eSave": "Chưa lưu được đăng ký. Kiểm tra mạng rồi bấm gửi lại.",
});
Object.assign(I18N.en, {
  "r.title": "Register now", "r.lead": "Free for FPT students in IT majors. Sign in with your @fpt.edu.vn Google account to start.",
  "r.s1": "Sign in with Google", "r.s1d": "@fpt.edu.vn accounts only",
  "r.s2": "Student details", "r.s2d": "Student ID, major, current term",
  "r.s3": "Attendance commitment", "r.s3d": "Read the rules and confirm",
  "r.k1": "Step 1/3", "r.loginT": "Sign in with your school email", "r.loginP": "Use your @fpt.edu.vn Google account so the organisers can confirm you're an FPT student.",
  "r.google": "Continue with Google",
  "r.eDomain": "That isn't a school account. Please sign in with your @fpt.edu.vn email.", "r.eFail": "Sign-in didn't go through. Please try again.",
  "r.verified": "Verified", "r.switch": "Switch account", "r.major": "Major",
  "r.rulesOpen": "Open to read the 5 rules before confirming", "r.rulesRead": "Read", "r.rulesMob": "Open the rules page",
  "r.hintRead": "Read the attendance commitment to unlock the checkbox.",
  "r.back": "Back to the form", "r.agree": "I've read it, back to the form",
  "r.mockTag": "Preview · simulated Google", "r.mockT": "Choose an account to continue", "r.gmail": "Google email", "r.cancel": "Cancel", "r.next": "Continue",
  "r.sumId": "Student ID", "r.sumMajor": "Major", "r.sumTerm": "Term",
  "r.idFromMail": "Suggested from your school email. Edit it if it's wrong", "r.idChip": "From email",
  "r.saving": "Saving your registration…", "r.eSave": "Couldn't save your registration. Check your connection and submit again.",
});
export function initRegistration() {
  const $ = id => document.getElementById(id);
  const form = $("regForm"), paneL = $("rLogin"), paneI = $("rInfo"), done = $("done"), steps = [...document.querySelectorAll("#regSteps li")];
  const btn = $("submitBtn"), cPledge = $("c-pledge"), hint = $("submitHint"), rules = $("rules"), rPage = $("rulesPage"), gMock = $("gMock");
  const mob = matchMedia("(max-width: 720px)");
  document.body.appendChild(rPage); document.body.appendChild(gMock); // ra ngoài section để luôn nằm trên header
  let user = null, read = false, lastFocus = null;
  const termBox = $("termPills");
  for (let i = 1; i <= 9; i++) {
    const l = document.createElement("label"); l.className = "pill";
    l.innerHTML = `<input type="radio" name="term" value="${i}"><span aria-hidden="true">${i}</span>`;
    termBox.appendChild(l);
  }
  const labelTerms = () => termBox.querySelectorAll("input").forEach(r => r.setAttribute("aria-label", t("f.termN") + r.value));
  labelTerms(); addEventListener("langchange", labelTerms);
  // Tên tài khoản FPT có đuôi khóa/cơ sở: "Nguyen Quoc An (K18 HCM)" → "Nguyen Quoc An"
  const shortName = n => String(n || "").replace(/\s*\([^)]*\)\s*$/, "").trim() || String(n || "").trim();
  const isSchool = e => new RegExp("^[^\\s@]+@" + SCHOOL_DOMAIN.replace(/\./g, "\\.") + "$", "i").test(String(e || "").trim());

  // --- Firebase thật (chỉ chạy khi có FIREBASE_CONFIG) ---
  const fbSignIn = async () => {
    const { signInWithGoogle, signOutUser } = fbMod || await fb();
    const u = await signInWithGoogle({ hd: SCHOOL_DOMAIN });
    if (!isSchool(u.email)) { await signOutUser(); throw "domain"; }
    return { uid: u.uid, name: u.displayName || u.email.split("@")[0], email: u.email, photo: u.photoURL };
  };
  // Đã đăng ký trước đó: điền lại form để sửa
  const prefill = async () => {
    try {
      const { getRegistration } = await fb(), r = await getRegistration(user.uid);
      if (!r) return;
      $("f-id").value = r.studentId || "";
      if (r.major) form.elements.major.value = r.major;
      if (r.term) form.elements.term.value = String(r.term);
      setIdHint(r.studentId === suggestedId);
    } catch (x) { console.warn("prefill", x); }
  };
  // --- Bản xem trước: cửa sổ mô phỏng ---
  const mockSignIn = () => new Promise((ok, no) => {
    const nm = $("gm-name"), ml = $("gm-mail");
    gMock.hidden = false; document.body.classList.add("no-scroll"); setTimeout(() => nm.focus(), 30);
    const close = () => { gMock.hidden = true; document.body.classList.remove("no-scroll"); $("gmOk").onclick = $("gmCancel").onclick = null; };
    $("gmCancel").onclick = () => { close(); no("cancel"); };
    $("gmOk").onclick = () => { const e = ml.value.trim(); close(); if (!isSchool(e)) return no("domain"); ok({ name: nm.value.trim() || e.split("@")[0], email: e, photo: "" }); };
  });

  const setStep = n => steps.forEach((li, i) => { li.classList.toggle("on", i + 1 === n); li.classList.toggle("ok", i + 1 < n || n === 4); });
  const showPane = p => { [paneL, paneI, done].forEach(x => x.hidden = x !== p); };
  const renderAcct = () => {
    if (!user) return;
    $("acName").textContent = user.name; $("acMail").textContent = user.email;
    const av = $("acAv");
    av.textContent = (shortName(user.name).split(/\s+/).pop() || "?")[0].toUpperCase();
    if (user.photo) {
      // Ảnh Google (googleusercontent) từ chối request có Referer; lỗi thì giữ chữ cái đầu
      const img = new Image(); img.alt = ""; img.referrerPolicy = "no-referrer";
      img.onload = () => { if (user && user.photo === img.src) av.replaceChildren(img); };
      img.src = user.photo;
    }
  };
  const sync = () => {
    cPledge.disabled = !read;
    $("rulesSum").textContent = read ? "✓ " + t("r.rulesRead") : t(mob.matches ? "r.rulesMob" : "r.rulesOpen");
    rules.classList.toggle("read", read);
    const ok = read && cPledge.checked; btn.disabled = !ok;
    hint.textContent = !read ? t("r.hintRead") : t(ok ? "f.hintOn" : "f.hintOff");
    if (!paneI.hidden) setStep(read ? 3 : 2);
  };
  // Trả về "ok" | "cancel" | "error"
  const signIn = async () => {
    const e = $("e-login"); e.textContent = ""; e.dataset.key = "";
    try { user = FIREBASE_CONFIG ? await fbSignIn() : await mockSignIn(); }
    catch (x) {
      if (x === "cancel" || x?.code === "auth/popup-closed-by-user" || x?.code === "auth/cancelled-popup-request") return "cancel";
      e.dataset.key = x === "domain" ? "r.eDomain" : "r.eFail"; e.textContent = t(e.dataset.key); return "error";
    }
    renderAcct(); suggestId(); showPane(paneI);
    if (!mob.matches) rules.open = true; // máy tính: mở sẵn điều lệ cam kết
    sync();
    if (FIREBASE_CONFIG) prefill();
    return "ok";
  };
  $("gBtn").addEventListener("click", async () => { if (await signIn() === "ok") $("f-id").focus(); });
  // Nút "Đăng ký" ở header/hero: chưa đăng nhập thì mở Google ngay trong cú bấm, xong mới cuộn tới form
  const noMotion = matchMedia("(prefers-reduced-motion: reduce)");
  document.querySelectorAll('a[href="#dang-ky"]').forEach(a => a.addEventListener("click", async ev => {
    if (user || paneL.hidden) return; // đã đăng nhập: cuộn xuống form như bình thường
    ev.preventDefault();
    const r = await signIn();
    if (r === "cancel") return;
    $("dang-ky").scrollIntoView({ behavior: noMotion.matches ? "auto" : "smooth", block: "start" });
    if (r === "ok") $("f-id").focus({ preventScroll: true });
  }));
  $("acSwitch").addEventListener("click", () => {
    if (FIREBASE_CONFIG) fb().then(m => m.signOutUser());
    if (idInput.value === suggestedId) { idInput.value = ""; setIdHint(false); }
    user = null; showPane(paneL); setStep(1); $("gBtn").focus();
  });

  // Điều lệ: máy tính mở dạng dropdown, điện thoại mở sang trang riêng
  rules.addEventListener("toggle", () => { if (rules.open) { read = true; sync(); } });
  rules.querySelector("summary").addEventListener("click", ev => {
    if (!mob.matches) return;
    ev.preventDefault(); openPage();
  });
  const openPage = () => {
    lastFocus = document.activeElement; rPage.hidden = false; rPage.scrollTop = 0; document.body.classList.add("no-scroll");
    try { history.pushState({ rules: 1 }, "", "#cam-ket"); } catch (e) {}
    $("rpBack").focus();
  };
  const closePage = (fromPop) => {
    if (rPage.hidden) return;
    rPage.hidden = true; document.body.classList.remove("no-scroll"); read = true; sync();
    if (!fromPop) { try { if (history.state && history.state.rules) history.back(); } catch (e) {} }
    (lastFocus || cPledge).focus();
  };
  $("rpBack").addEventListener("click", () => closePage(false));
  $("rpAgree").addEventListener("click", () => { closePage(false); cPledge.checked = true; sync(); });
  addEventListener("popstate", () => closePage(true));
  addEventListener("keydown", e => { if (e.key === "Escape") { if (!rPage.hidden) closePage(false); else if (!gMock.hidden) $("gmCancel").click(); } });
  mob.addEventListener && mob.addEventListener("change", () => { if (mob.matches) rules.open = false; sync(); });
  cPledge.addEventListener("change", sync);

  const idInput = $("f-id"), idHint = $("h-id");
  // MSSV nằm cuối phần trước @ của mail trường (annqse183962@fpt.edu.vn → SE183962): điền sẵn, sinh viên vẫn sửa được
  let suggestedId = "";
  const setIdHint = on => { idHint.dataset.i18n = on ? "r.idFromMail" : "f.idHint"; idHint.textContent = t(idHint.dataset.i18n); $("idChip").hidden = !on; };
  const suggestId = () => {
    if (idInput.value && idInput.value !== suggestedId) return; // sinh viên đã tự nhập
    const m = /([a-z]{2})(\d{6})@/i.exec(user.email);
    suggestedId = m ? (m[1] + m[2]).toUpperCase() : "";
    idInput.value = suggestedId; setIdHint(!!suggestedId);
  };
  idInput.addEventListener("input", () => {
    idInput.value = idInput.value.toUpperCase().replace(/\s/g, "");
    if (idInput.value !== suggestedId) setIdHint(false);
  });
  // MSSV là ô nhập; ngành và kỳ là nhóm radio (form.elements.x.value lấy giá trị đang chọn)
  const radioFocus = name => { const rs = [...form.elements[name]]; (rs.find(r => r.checked) || rs[0]).focus(); };
  const fields = {
    id: { box: idInput.closest(".field"), inv: idInput, get: () => idInput.value, rule: v => /^[A-Z]{2}\d{6}$/.test(v.trim()) ? "" : "e.id", focus: () => idInput.focus() },
    major: { box: $("f-major"), inv: $("f-major"), get: () => form.elements.major.value, rule: v => v ? "" : "e.major", focus: () => radioFocus("major") },
    term: { box: $("f-term"), inv: $("f-term"), get: () => form.elements.term.value, rule: v => v ? "" : "e.term", focus: () => radioFocus("term") },
  };
  const check = k => {
    const f = fields[k], key = f.rule(f.get());
    f.box.classList.toggle("bad", !!key); f.inv.setAttribute("aria-invalid", key ? "true" : "false");
    const er = $("e-" + k); er.textContent = key ? t(key) : ""; er.dataset.key = key; return !key;
  };
  idInput.addEventListener("blur", () => { if (idInput.value) check("id"); });
  idInput.addEventListener("input", () => { if (fields.id.box.classList.contains("bad")) check("id"); });
  ["major", "term"].forEach(k => fields[k].box.addEventListener("change", () => { if (fields[k].box.classList.contains("bad")) check(k); }));
  const renderDone = () => {
    const major = form.querySelector('input[name="major"]:checked'), last = shortName(user.name).split(/\s+/).pop();
    $("doneTitle").textContent = t("d.title")(last);
    $("doneText").innerHTML = t("d.text")(esc(user.email), pick(COURSE.resultDate) ? esc(pick(COURSE.resultDate)) : "");
    $("doneSum").innerHTML = [[t("r.sumId"), idInput.value], [t("r.sumMajor"), major ? major.nextElementSibling.textContent : ""], [t("r.sumTerm"), t("f.termN") + form.elements.term.value]].map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join("");
  };
  let saving = false;
  form.addEventListener("submit", async e => {
    e.preventDefault(); if (!user || saving) return;
    const keys = Object.keys(fields), bad = keys[keys.map(check).indexOf(false)];
    if (bad) { fields[bad].focus(); return; }
    if (FIREBASE_CONFIG) {
      saving = true; btn.disabled = true; hint.textContent = t("r.saving");
      try {
        const { saveRegistration } = await fb();
        await saveRegistration(user, { studentId: idInput.value.trim(), major: form.elements.major.value, term: form.elements.term.value, pledge: true, lang: LANG });
      } catch (x) {
        console.error("saveRegistration", x); saving = false; sync(); hint.textContent = t("r.eSave"); return;
      }
      saving = false; sync();
    }
    renderDone(); showPane(done); setStep(4); done.focus();
  });
  $("againBtn").addEventListener("click", () => { showPane(paneI); sync(); idInput.focus(); });
  addEventListener("langchange", () => {
    sync(); document.querySelectorAll(".err").forEach(el => { if (el.dataset.key) el.textContent = t(el.dataset.key); });
    if (!done.hidden) renderDone();
  });
  setStep(1); sync();
  // Nạp sớm để nút Đăng ký ở header mở popup ngay trong cú bấm
  if (FIREBASE_CONFIG) (window.requestIdleCallback || (f => setTimeout(f, 300)))(() => fb().catch(x => console.warn("firebase preload", x)));
}
