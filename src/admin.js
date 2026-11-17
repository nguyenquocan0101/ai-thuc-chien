import { signInWithGoogle, signOutUser, onUserChange, watchRegistrations } from "./lib/firebase.js";
import { isAdminEmail } from "./lib/admins.js";
import { enhanceSelects } from "./components/dropdown.js";
import { createSidebar } from "./components/sidebar.js";
import { createPageHeader } from "./components/page-header.js";
import { downloadCsv } from "./lib/csv.js";
import { startSchedule } from "./scripts/admin-schedule.js";

const $ = id => document.getElementById(id);
const MAJORS = { SE: "Kỹ thuật phần mềm", AI: "Trí tuệ nhân tạo", IA: "An toàn thông tin", IS: "Hệ thống thông tin", OTHER: "Ngành khác" };
const views = ["vLoading", "vLogin", "vDenied", "vList"];
const showView = id => views.forEach(v => { $(v).hidden = v !== id; });

let all = [], stopWatch = null, stopSchedule = null;

const toDate = ts => (ts && typeof ts.toDate === "function" ? ts.toDate() : null);
const fmtDate = ts => { const d = toDate(ts); return d ? d.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "—"; };
const majorName = code => MAJORS[code] || code || "—";

Object.entries(MAJORS).forEach(([code, name]) => { const o = document.createElement("option"); o.value = code; o.textContent = name; $("fMajor").appendChild(o); });
enhanceSelects();

// Icon nét 24×24 cho từng mục của sidebar
const ICONS = {
  list: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 12h6M9 16h6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7l10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>'
};
const NAV_ITEMS = [
  { id: "dang-ky", label: "Đăng ký", panel: "pDangKy", icon: ICONS.list },
  { id: "sinh-vien", label: "Sinh viên", panel: "pSinhVien", icon: ICONS.users },
  { id: "buoi-hoc", label: "Buổi học", panel: "pBuoiHoc", icon: ICONS.calendar },
  { id: "lop", label: "Lớp", panel: "pLop", icon: ICONS.layers }
];
const nav = createSidebar({ label: "Mục quản trị", items: NAV_ITEMS });
$("sidebarSlot").replaceWith(nav.el);

// Đầu trang của từng mục: breadcrumb Quản trị / khoá / mục, tiêu đề (data-title), dòng tóm tắt [data-meta] và nút [data-actions]
for (const item of NAV_ITEMS) {
  const panel = $(item.panel);
  panel.prepend(createPageHeader({
    crumbs: [{ label: "Quản trị", href: "/admin/" + location.search }, { label: "AI Thực Chiến FA26" }, { label: item.label }],
    title: panel.dataset.title || item.label,
    meta: panel.querySelector(":scope > [data-meta]"),
    actions: panel.querySelector(":scope > [data-actions]")
  }));
}

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

function exportCsv() {
  const head = ["STT", "Họ tên", "Email", "MSSV", "Ngành", "Kỳ", "Đăng ký lúc", "Cập nhật lúc"];
  const lines = filtered().map((r, i) => [i + 1, r.name, r.email, r.studentId || "", majorName(r.major), r.term, fmtDate(r.createdAt), r.updatedAt ? fmtDate(r.updatedAt) : ""]);
  downloadCsv("dang-ky-ai-thuc-chien", head, lines);
}

function startWatch() {
  $("listErr").textContent = "";
  stopWatch = watchRegistrations(rows => { all = rows; render(); nav.setBadge("dang-ky", String(rows.length)); }, err => {
    console.error(err);
    $("listErr").textContent = err.code === "permission-denied"
      ? "Firestore từ chối quyền đọc. Kiểm tra email này đã có trong firestore.rules chưa."
      : "Không tải được dữ liệu: " + err.message;
  });
  stopSchedule = startSchedule({ majors: MAJORS, registrations: () => all, setBadge: nav.setBadge });
}

onUserChange(user => {
  if (stopWatch) { stopWatch(); stopWatch = null; }
  if (stopSchedule) { stopSchedule(); stopSchedule = null; }
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
