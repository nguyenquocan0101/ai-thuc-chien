/* ===== Đăng ký: Google (@fpt.edu.vn) → thông tin sinh viên → cam kết ===== */
// Khi có Firebase: dán firebaseConfig vào FIREBASE_CONFIG. Để null thì trang dùng cửa sổ mô phỏng (bản xem trước, không gửi dữ liệu đi đâu).
const FIREBASE_CONFIG = window.FIREBASE_CONFIG || null;
const SCHOOL_DOMAIN = "fpt.edu.vn";
Object.assign(I18N.vi, {
  "r.title": "Đăng ký ngay", "r.lead": "Miễn phí cho sinh viên FPT khối IT. Đăng nhập bằng tài khoản Google @fpt.edu.vn để bắt đầu.",
  "r.s1": "Đăng nhập Google", "r.s1d": "Chỉ nhận tài khoản @fpt.edu.vn",
  "r.s2": "Thông tin sinh viên", "r.s2d": "MSSV, ngành học, học kỳ hiện tại",
  "r.s3": "Cam kết tham gia", "r.s3d": "Đọc điều lệ và xác nhận",
  "r.k1": "Bước 1/3", "r.loginT": "Đăng nhập bằng mail trường", "r.loginP": "Dùng tài khoản Google @fpt.edu.vn để ban tổ chức xác nhận bạn là sinh viên FPT.",
  "r.google": "Tiếp tục với Google", "r.loginNote": "Chúng tôi chỉ đọc họ tên và email từ tài khoản Google của bạn.",
  "r.eDomain": "Tài khoản này không phải mail trường. Hãy đăng nhập bằng email @fpt.edu.vn.", "r.eFail": "Đăng nhập chưa thành công, bạn thử lại nhé.",
  "r.verified": "Đã xác minh", "r.switch": "Đổi tài khoản", "r.major": "Ngành học",
  "r.rulesOpen": "Bấm để đọc 5 điều lệ trước khi xác nhận", "r.rulesRead": "Đã đọc", "r.rulesMob": "Mở trang điều lệ",
  "r.hintRead": "Đọc điều lệ Cam kết tham gia để mở ô xác nhận.",
  "r.back": "Quay lại form", "r.agree": "Tôi đã đọc, quay lại form",
  "r.mockTag": "Bản xem trước · mô phỏng Google", "r.mockT": "Chọn tài khoản để tiếp tục", "r.gmail": "Email Google", "r.cancel": "Hủy", "r.next": "Tiếp tục",
  "r.sumId": "MSSV", "r.sumMajor": "Ngành", "r.sumTerm": "Học kỳ",
});
Object.assign(I18N.en, {
  "r.title": "Register now", "r.lead": "Free for FPT students in IT majors. Sign in with your @fpt.edu.vn Google account to start.",
  "r.s1": "Sign in with Google", "r.s1d": "@fpt.edu.vn accounts only",
  "r.s2": "Student details", "r.s2d": "Student ID, major, current term",
  "r.s3": "Attendance commitment", "r.s3d": "Read the rules and confirm",
  "r.k1": "Step 1/3", "r.loginT": "Sign in with your school email", "r.loginP": "Use your @fpt.edu.vn Google account so the organisers can confirm you're an FPT student.",
  "r.google": "Continue with Google", "r.loginNote": "We only read your name and email from your Google account.",
  "r.eDomain": "That isn't a school account. Please sign in with your @fpt.edu.vn email.", "r.eFail": "Sign-in didn't go through. Please try again.",
  "r.verified": "Verified", "r.switch": "Switch account", "r.major": "Major",
  "r.rulesOpen": "Open to read the 5 rules before confirming", "r.rulesRead": "Read", "r.rulesMob": "Open the rules page",
  "r.hintRead": "Read the attendance commitment to unlock the checkbox.",
  "r.back": "Back to the form", "r.agree": "I've read it, back to the form",
  "r.mockTag": "Preview · simulated Google", "r.mockT": "Choose an account to continue", "r.gmail": "Google email", "r.cancel": "Cancel", "r.next": "Continue",
  "r.sumId": "Student ID", "r.sumMajor": "Major", "r.sumTerm": "Term",
});
(function () {
  const $ = id => document.getElementById(id);
  const form = $("regForm"), paneL = $("rLogin"), paneI = $("rInfo"), done = $("done"), steps = [...document.querySelectorAll("#regSteps li")];
  const btn = $("submitBtn"), cPledge = $("c-pledge"), hint = $("submitHint"), rules = $("rules"), rPage = $("rulesPage"), gMock = $("gMock");
  const mob = matchMedia("(max-width: 720px)");
  document.body.appendChild(rPage); document.body.appendChild(gMock); // ra ngoài section để luôn nằm trên header
  let user = null, read = false, lastFocus = null;
  const isSchool = e => new RegExp("^[^\\s@]+@" + SCHOOL_DOMAIN.replace(/\./g, "\\.") + "$", "i").test(String(e || "").trim());

  // --- Firebase thật (chỉ chạy khi có FIREBASE_CONFIG) ---
  const loadJs = src => new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  const fbSignIn = async () => {
    if (!window.firebase) { await loadJs("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"); await loadJs("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"); }
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    const p = new firebase.auth.GoogleAuthProvider(); p.setCustomParameters({ hd: SCHOOL_DOMAIN, prompt: "select_account" });
    const r = await firebase.auth().signInWithPopup(p);
    if (!isSchool(r.user.email)) { await firebase.auth().signOut(); throw "domain"; }
    return { name: r.user.displayName || r.user.email.split("@")[0], email: r.user.email, photo: r.user.photoURL };
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
    const av = $("acAv"); av.innerHTML = user.photo ? `<img src="${esc(user.photo)}" alt="">` : esc((user.name.trim().split(/\s+/).pop() || "?")[0].toUpperCase());
  };
  const sync = () => {
    cPledge.disabled = !read;
    $("rulesSum").textContent = read ? "✓ " + t("r.rulesRead") : t(mob.matches ? "r.rulesMob" : "r.rulesOpen");
    rules.classList.toggle("read", read);
    const ok = read && cPledge.checked; btn.disabled = !ok;
    hint.textContent = !read ? t("r.hintRead") : t(ok ? "f.hintOn" : "f.hintOff");
    if (!paneI.hidden) setStep(read ? 3 : 2);
  };
  $("gBtn").addEventListener("click", async () => {
    const e = $("e-login"); e.textContent = ""; e.dataset.key = "";
    try { user = FIREBASE_CONFIG ? await fbSignIn() : await mockSignIn(); }
    catch (x) { if (x !== "cancel") { e.dataset.key = x === "domain" ? "r.eDomain" : "r.eFail"; e.textContent = t(e.dataset.key); } return; }
    renderAcct(); showPane(paneI); sync(); $("f-id").focus();
  });
  $("acSwitch").addEventListener("click", () => { if (FIREBASE_CONFIG && window.firebase) firebase.auth().signOut(); user = null; showPane(paneL); setStep(1); $("gBtn").focus(); });

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

  const idInput = $("f-id");
  idInput.addEventListener("input", () => { idInput.value = idInput.value.toUpperCase().replace(/\s/g, ""); });
  const ruleF = { "f-id": v => /^[A-Z]{2}\d{6}$/.test(v.trim()) ? "" : "e.id", "f-major": v => v ? "" : "e.major", "f-term": v => v ? "" : "e.term" };
  const check = id => {
    const el = $(id), key = ruleF[id](el.value), f = el.closest(".field");
    f.classList.toggle("bad", !!key); el.setAttribute("aria-invalid", key ? "true" : "false");
    const er = $("e-" + id.slice(2)); er.textContent = key ? t(key) : ""; er.dataset.key = key; return !key;
  };
  Object.keys(ruleF).forEach(id => { const el = $(id); el.addEventListener("blur", () => { if (el.value) check(id); }); ["input", "change"].forEach(ev => el.addEventListener(ev, () => { if (el.closest(".field").classList.contains("bad")) check(id); })); });
  const renderDone = () => {
    const sel = $("f-major"), last = user.name.trim().split(/\s+/).pop();
    $("doneTitle").textContent = t("d.title")(last);
    $("doneText").innerHTML = t("d.text")(esc(user.email), pick(COURSE.resultDate) ? esc(pick(COURSE.resultDate)) : "");
    $("doneSum").innerHTML = [[t("r.sumId"), idInput.value], [t("r.sumMajor"), sel.options[sel.selectedIndex].text], [t("r.sumTerm"), t("f.termN") + $("f-term").value]].map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join("");
  };
  form.addEventListener("submit", e => {
    e.preventDefault(); if (!user) return;
    const ids = Object.keys(ruleF), bad = ids[ids.map(check).indexOf(false)];
    if (bad) { $(bad).focus(); return; }
    renderDone(); showPane(done); setStep(4); done.focus();
  });
  $("againBtn").addEventListener("click", () => { showPane(paneI); sync(); idInput.focus(); });
  addEventListener("langchange", () => {
    sync(); document.querySelectorAll(".err").forEach(el => { if (el.dataset.key) el.textContent = t(el.dataset.key); });
    if (!done.hidden) renderDone();
  });
  setStep(1); sync();
})();

