import { signInWithGoogle, signOutUser, onUserChange, watchRegistrations } from "./lib/firebase.js";
import { isAdminEmail } from "./lib/admins.js";
import { enhanceSelects } from "./lib/select-menu.js";

const $ = id => document.getElementById(id);
const MAJORS = { SE: "Kỹ thuật phần mềm", AI: "Trí tuệ nhân tạo", IA: "An toàn thông tin", IS: "Hệ thống thông tin", OTHER: "Chuyên ngành khác khối IT" };
const views = ["vLoading", "vLogin", "vDenied", "vList"];
const showView = id => views.forEach(v => { $(v).hidden = v !== id; });

let all = [], stopWatch = null;

const toDate = ts => (ts && typeof ts.toDate === "function" ? ts.toDate() : null);
const fmtDate = ts => { const d = toDate(ts); return d ? d.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "—"; };
const majorName = code => MAJORS[code] || code || "—";

Object.entries(MAJORS).forEach(([code, name]) => { const o = document.createElement("option"); o.value = code; o.textContent = name; $("fMajor").appendChild(o); });
enhanceSelects();

function filtered() {
  const q = $("q").value.trim().toLowerCase(), m = $("fMajor").value;
  return all.filter(r => (!m || r.major === m) &&
    (!q || [r.name, r.email, r.studentId].some(v => String(v || "").toLowerCase().includes(q))));
}

function render() {
  const list = filtered(), body = $("rows");
  body.replaceChildren(...list.map((r, i) => {
    const tr = document.createElement("tr");
    [String(i + 1), r.name, r.email, r.studentId, majorName(r.major), r.term ? "Kỳ " + r.term : "—", fmtDate(r.createdAt)].forEach((v, k) => {
      const td = document.createElement("td"); td.textContent = v || "—";
      if (k === 0 || k === 3 || k === 5) td.className = "mono";
      tr.appendChild(td);
    });
    return tr;
  }));
  $("empty").hidden = list.length > 0;
  $("empty").textContent = all.length ? "Không có kết quả phù hợp." : "Chưa có sinh viên nào đăng ký.";
  $("summary").textContent = list.length === all.length ? `${all.length} sinh viên đã đăng ký` : `${list.length} / ${all.length} sinh viên`;
  const counts = {};
  all.forEach(r => { counts[r.major] = (counts[r.major] || 0) + 1; });
  $("chips").replaceChildren(...Object.keys(MAJORS).filter(c => counts[c]).map(c => {
    const s = document.createElement("span"); s.className = "chip"; s.textContent = `${MAJORS[c]} · ${counts[c]}`; return s;
  }));
}

// Spreadsheet apps execute cells starting with = + - @ as formulas
const csvCell = v => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };

function exportCsv() {
  const head = ["STT", "Họ tên", "Email", "MSSV", "Ngành", "Kỳ", "Đăng ký lúc", "Cập nhật lúc"];
  const lines = filtered().map((r, i) => [i + 1, r.name, r.email, r.studentId, majorName(r.major), r.term, fmtDate(r.createdAt), fmtDate(r.updatedAt)]);
  const csv = "﻿" + [head, ...lines].map(row => row.map(csvCell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `dang-ky-ai-thuc-chien-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function startWatch() {
  $("listErr").textContent = "";
  stopWatch = watchRegistrations(rows => { all = rows; render(); }, err => {
    console.error(err);
    $("listErr").textContent = err.code === "permission-denied"
      ? "Firestore từ chối quyền đọc. Kiểm tra email này đã có trong firestore.rules chưa."
      : "Không tải được dữ liệu: " + err.message;
  });
}

onUserChange(user => {
  if (stopWatch) { stopWatch(); stopWatch = null; }
  $("who").hidden = !user;
  if (!user) { showView("vLogin"); return; }
  $("whoMail").textContent = user.email;
  if (!isAdminEmail(user.email)) { $("deniedMail").textContent = user.email; showView("vDenied"); return; }
  showView("vList");
  startWatch();
});

$("signInBtn").addEventListener("click", async () => {
  $("loginErr").textContent = "";
  try { await signInWithGoogle(); }
  catch (e) { if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") $("loginErr").textContent = "Đăng nhập chưa thành công: " + (e.code || e.message); }
});
// Open the popup straight from the click (an await before it would trip popup blockers); select_account lets them pick another account
$("switchBtn").addEventListener("click", () => signInWithGoogle().catch(e => console.warn(e.code || e)));
$("signOutBtn").addEventListener("click", () => signOutUser());
$("q").addEventListener("input", render);
$("fMajor").addEventListener("change", render);
$("csvBtn").addEventListener("click", exportCsv);
