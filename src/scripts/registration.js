import { I18N, LANG, t, esc, pick } from "./i18n.js";
import { COURSE } from "./course.js";
import { firebaseConfig } from "../lib/firebase-config.js";

/* ===== Đăng ký: bấm "Tham gia ngay" → form mở ngay trong khối CTA → gửi, không cần đăng nhập ===== */
// Cấu hình ở src/lib/firebase-config.js. Để null thì form chạy thử: không gửi dữ liệu đi đâu.
const FIREBASE_CONFIG = firebaseConfig;
// SDK tách chunk riêng, nạp sẵn khi trang rảnh để bấm Gửi là lưu ngay
let fbMod = null;
const fb = () => fbMod ? Promise.resolve(fbMod) : import("../lib/firebase.js").then(m => (fbMod = m));
Object.assign(I18N.vi, {
  "r.ctaT": "Bạn là sinh viên IT và đang gặp khó khăn?", "r.ctaP": "Hai tuần cùng nhóm làm một ứng dụng web chạy thật, có AI code cùng. Để lại thông tin để giữ chỗ.",
  "r.perk1": "6 bước thực hành", "r.perk2": "Làm ra sản phẩm chạy được", "r.perk3": "Chứng nhận khi hoàn thành",
  "r.join": "Tham gia ngay", "r.major": "Ngành học", "r.sid": "MSSV", "r.eSid": "Nhập MSSV gồm 2 chữ cái và 6 chữ số, ví dụ SE123456.",
  "r.sumEmail": "Email", "r.sumSid": "MSSV", "r.sumMajor": "Ngành", "r.sumTerm": "Học kỳ",
  "r.saving": "Đang lưu đăng ký…", "r.eSave": "Chưa lưu được đăng ký. Kiểm tra mạng rồi bấm gửi lại.",
  "r.eDup": "Email này đã đăng ký rồi. Cần sửa thông tin thì liên hệ ban tổ chức nhé.",
});
Object.assign(I18N.en, {
  "r.ctaT": "An IT student who's feeling stuck?", "r.ctaP": "Two weeks building a working web app with your team and an AI coding agent. Leave your details to save your spot.",
  "r.perk1": "6 hands-on steps", "r.perk2": "Ship software that really runs", "r.perk3": "Certificate on completion",
  "r.join": "Join now", "r.major": "Major", "r.sid": "Student ID", "r.eSid": "Enter your student ID: 2 letters and 6 digits, e.g. SE123456.",
  "r.sumEmail": "Email", "r.sumSid": "Student ID", "r.sumMajor": "Major", "r.sumTerm": "Term",
  "r.saving": "Saving your registration…", "r.eSave": "Couldn't save your registration. Check your connection and submit again.",
  "r.eDup": "This email is already registered. Contact the organisers if you need to change your details.",
});

// Khớp với firestore.rules: không khoảng trắng, không "/", có @ và dấu chấm sau @
const EMAIL_RE = /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/;
// MSSV FPT: 2 chữ cái + 6 chữ số (SE123456), khớp với firestore.rules
const SID_RE = /^[A-Z]{2}[0-9]{6}$/;

export function initRegistration() {
  const $ = id => document.getElementById(id);
  const cta = $("regCta"), form = $("regForm"), done = $("done");
  const foldPitch = $("foldPitch"), foldForm = $("foldForm"), foldDone = $("foldDone");
  const btn = $("submitBtn"), cPledge = $("c-pledge"), hint = $("submitHint"), gBtn = $("gBtn");
  const emailInput = $("f-email"), nameInput = $("f-name"), sidInput = $("f-sid"), majorSel = $("f-major"), termSel = $("f-term");
  for (let i = 1; i <= 9; i++) { const o = document.createElement("option"); o.value = String(i); termSel.appendChild(o); }
  const labelTerms = () => [...termSel.options].slice(1).forEach(o => { o.textContent = t("f.termN") + o.value; });
  labelTerms(); addEventListener("langchange", labelTerms);
  // Thời gian học trên nhãn CTA lấy từ course.js; chưa có thì ẩn
  const ctaWhen = $("ctaWhen");
  const showWhen = () => { const p = pick(COURSE.period); ctaWhen.lastElementChild.textContent = p || ""; ctaWhen.hidden = !p; };
  showWhen(); addEventListener("langchange", showWhen);

  // --- Gấp/mở mượt: CSS chuyển grid-template-rows 1fr ↔ 0fr; phần đang gấp là inert để Tab không lọt vào ---
  const noMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const FOLD_MS = 620;
  const fold = (el, open) => {
    clearTimeout(el._settle);
    el.classList.remove("is-settled"); // overflow:hidden trong lúc chuyển, mở xong mới hiện viền focus/bóng
    el.classList.toggle("is-shut", !open);
    el.inert = !open;
    if (open) el._settle = setTimeout(() => el.classList.add("is-settled"), noMotion.matches ? 0 : FOLD_MS);
  };
  const scrollToCta = () => cta.scrollIntoView({ behavior: noMotion.matches ? "auto" : "smooth", block: "start" });

  let stage = "pitch"; // pitch | form | done
  const openForm = () => {
    if (stage !== "pitch") return;
    stage = "form";
    cta.classList.add("is-open");
    fold(foldPitch, false); fold(foldForm, true);
    gBtn.setAttribute("aria-expanded", "true");
    // Đợi form mở xong mới focus: bàn phím điện thoại bật lên giữa chừng làm giật animation
    setTimeout(() => emailInput.focus({ preventScroll: true }), noMotion.matches ? 0 : FOLD_MS - 120);
  };
  gBtn.addEventListener("click", openForm);
  // Mọi nút Đăng ký (header, hero) cuộn tới khối CTA và mở form
  document.querySelectorAll('a[href="#dang-ky"]').forEach(a => a.addEventListener("click", ev => {
    ev.preventDefault(); scrollToCta(); openForm();
  }));

  const sync = () => {
    const ok = cPledge.checked; btn.disabled = !ok || saving;
    if (!saving) { hint.dataset.key = ""; hint.textContent = t(ok ? "f.hintOn" : "f.hintOff"); }
  };
  cPledge.addEventListener("change", sync);

  // --- Kiểm tra từng ô; select đã được bọc bởi dropdown dùng chung: .value và .focus() vẫn đi qua select gốc ---
  const cleanEmail = () => emailInput.value.trim().toLowerCase();
  const cleanName = () => nameInput.value.replace(/\s+/g, " ").trim();
  const cleanSid = () => sidInput.value.replace(/\s+/g, "").toUpperCase();
  const fields = {
    email: { el: emailInput, rule: () => { const v = cleanEmail(); return EMAIL_RE.test(v) && v.length <= 254 ? "" : "e.email"; } },
    name: { el: nameInput, rule: () => cleanName() ? "" : "e.name" },
    sid: { el: sidInput, rule: () => SID_RE.test(cleanSid()) ? "" : "r.eSid" },
    major: { el: majorSel, rule: () => majorSel.value ? "" : "e.major" },
    term: { el: termSel, rule: () => termSel.value ? "" : "e.term" },
  };
  const check = k => {
    const { el, rule } = fields[k], key = rule(), box = el.closest(".field");
    box.classList.toggle("bad", !!key); el.setAttribute("aria-invalid", key ? "true" : "false");
    const er = $("e-" + k); er.textContent = key ? t(key) : ""; er.dataset.key = key; return !key;
  };
  const isBad = k => fields[k].el.closest(".field").classList.contains("bad");
  [["email", emailInput], ["name", nameInput], ["sid", sidInput]].forEach(([k, el]) => {
    el.addEventListener("blur", () => { if (el.value.trim()) check(k); });
    el.addEventListener("input", () => { if (isBad(k)) check(k); });
  });
  ["major", "term"].forEach(k => fields[k].el.addEventListener("change", () => { if (isBad(k)) check(k); }));

  const renderDone = () => {
    const last = cleanName().split(" ").pop();
    $("doneTitle").textContent = t("d.title")(last);
    $("doneText").innerHTML = t("d.text")(esc(cleanEmail()), pick(COURSE.resultDate) ? esc(pick(COURSE.resultDate)) : "");
    $("doneSum").innerHTML = [[t("r.sumSid"), cleanSid()], [t("r.sumMajor"), majorSel.selectedOptions[0]?.textContent || ""], [t("r.sumTerm"), t("f.termN") + termSel.value]]
      .map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`).join("");
  };
  const setHintKey = key => { hint.dataset.key = key; hint.textContent = t(key); };

  let saving = false;
  form.addEventListener("submit", async e => {
    e.preventDefault(); if (saving) return;
    const keys = Object.keys(fields), bad = keys[keys.map(check).indexOf(false)];
    if (bad) { fields[bad].el.focus(); return; }
    if (FIREBASE_CONFIG) {
      saving = true; btn.disabled = true; setHintKey("r.saving");
      try {
        const { submitRegistration } = await fb();
        await submitRegistration({ name: cleanName(), email: cleanEmail(), studentId: cleanSid(), major: majorSel.value, term: termSel.value, lang: LANG });
      } catch (x) {
        // Dữ liệu đã qua kiểm tra giống rules, nên bị từ chối nghĩa là email này đã có document (gửi lại thành update)
        console.error("submitRegistration", x);
        saving = false; sync(); setHintKey(x?.code === "permission-denied" ? "r.eDup" : "r.eSave"); return;
      }
      saving = false;
    } else $("demoNote").hidden = false;
    hint.dataset.key = "";
    stage = "done";
    renderDone();
    fold(foldForm, false); fold(foldDone, true);
    done.focus({ preventScroll: true });
    // Khối co lại: kéo lên đầu khối để người dùng thấy lời xác nhận
    if (cta.getBoundingClientRect().top < 0) scrollToCta();
  });

  addEventListener("langchange", () => {
    if (hint.dataset.key) hint.textContent = t(hint.dataset.key); else sync();
    document.querySelectorAll(".reg-cta .err").forEach(el => { if (el.dataset.key) el.textContent = t(el.dataset.key); });
    if (stage === "done") renderDone();
  });
  sync();
  if (FIREBASE_CONFIG) (window.requestIdleCallback || (f => setTimeout(f, 300)))(() => fb().catch(x => console.warn("firebase preload", x)));
}
