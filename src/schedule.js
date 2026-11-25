// Trang /lich: sinh viên trong danh sách đăng nhập Google, kiểm tra lại thông tin, rồi xem lịch học chính thức
// của lớp mình (admin xếp lớp vào students/{email}.classId, lịch từng lớp nằm trong course.js). Quyền do firestore.rules kiểm soát.
import { signInWithGoogle, signOutUser, onUserChange, readDocument, updateStudentInfo } from "./lib/firebase.js";
import { MAJORS } from "./lib/majors.js";
import { enhanceSelects } from "./components/dropdown.js";
import { SID_RE, cleanSid, safeUrl } from "./lib/schedule.js";
import { CLASSES } from "./scripts/course.js";

const $ = id => document.getElementById(id);
const views = ["vLoading", "vLogin", "vMissing", "vSid", "vMain"];
const showView = id => views.forEach(v => { $(v).hidden = v !== id; });

let gen = 0;   // tăng mỗi lần đổi tài khoản, để bỏ kết quả của lần tải cũ
let me = null; // { email, name, studentId, major, term, classId }

const DOW = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const dowName = iso => { const [y, m, d] = iso.split("-").map(Number); return DOW[new Date(y, m - 1, d).getDay()]; };
// "2026-11-23" → "23/11", kèm năm khi cần
const fmtDate = (iso, year) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}${year ? "/" + iso.slice(0, 4) : ""}`;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

function fail(e, target = "mainErr") {
  console.error(e);
  $(target).textContent = e.code === "permission-denied"
    ? "Bạn không có quyền thực hiện thao tác này. Tải lại trang để xem trạng thái mới nhất."
    : "Có lỗi khi kết nối: " + (e.code || e.message);
}

onUserChange(async user => {
  const my = ++gen;
  me = null;
  $("who").hidden = !user;
  if (!user) { showView("vLogin"); return; }
  $("whoMail").textContent = user.email;
  showView("vLoading");
  const email = String(user.email || "").toLowerCase();
  try {
    const stu = await readDocument(`students/${email}`);
    if (my !== gen) return;
    if (!stu) { $("missingMail").textContent = user.email; showView("vMissing"); return; }
    me = { email, name: stu.name || user.displayName || "", studentId: stu.studentId || "", major: stu.major || "", term: stu.term || "", classId: stu.classId || "" };
    // Lần đầu vào: kiểm tra lại thông tin đăng ký trước khi xem lịch
    if (stu.infoConfirmedAt && me.studentId) enterMain(); else askInfo(false);
  } catch (e) {
    if (my !== gen) return;
    showView("vLogin");
    fail(e, "loginErr");
  }
});

// Ngành và kỳ: lựa chọn cố định, kỳ 1–9 như form đăng ký
Object.entries(MAJORS).forEach(([code, name]) => $("infoMajor").append(new Option(name, code)));
for (let t = 1; t <= 9; t++) $("infoTerm").append(new Option("Kỳ " + t, String(t)));
enhanceSelects($("vSid"));

function askInfo(canGoBack) {
  $("infoEmail").value = me.email;
  $("infoName").value = me.name;
  $("sidInput").value = me.studentId;
  $("infoMajor").value = MAJORS[me.major] ? me.major : "";
  $("infoTerm").value = /^[1-9]$/.test(me.term) ? me.term : "";
  $("infoBack").hidden = !canGoBack;
  $("sidErr").textContent = "";
  $("sidForm").querySelectorAll("[aria-invalid]").forEach(x => x.removeAttribute("aria-invalid"));
  showView("vSid");
  $("infoName").focus();
}

function infoProblem(v) {
  if (!v.name) return ["infoName", "Nhập họ tên."];
  if (!SID_RE.test(v.studentId)) return ["sidInput", "MSSV gồm 2 chữ cái và 6 chữ số, ví dụ SE123456."];
  if (!MAJORS[v.major]) return ["infoMajor", "Chọn ngành."];
  if (!/^[1-9]$/.test(v.term)) return ["infoTerm", "Chọn kỳ."];
  return null;
}

$("sidForm").addEventListener("submit", async e => {
  e.preventDefault();
  const v = { name: $("infoName").value.trim().replace(/\s+/g, " "), studentId: cleanSid($("sidInput").value), major: $("infoMajor").value, term: $("infoTerm").value };
  const problem = infoProblem(v);
  $("sidForm").querySelectorAll("[aria-invalid]").forEach(x => x.removeAttribute("aria-invalid"));
  if (problem) {
    const [id, msg] = problem;
    $("sidErr").textContent = msg;
    $(id).setAttribute("aria-invalid", "true");
    $(id).focus();
    return;
  }
  $("sidBtn").disabled = true;
  const my = gen;
  try {
    await updateStudentInfo(me.email, v);
    if (my !== gen) return;
    Object.assign(me, v);
    enterMain();
  } catch (err) {
    fail(err, "sidErr");
  } finally {
    $("sidBtn").disabled = false;
  }
});
$("infoBack").addEventListener("click", () => showView("vMain"));
$("infoEdit").addEventListener("click", () => askInfo(true));

function enterMain() {
  $("meName").textContent = me.name;
  $("meSid").textContent = me.studentId;
  $("mainErr").textContent = "";
  renderSessions(CLASSES[me.classId]);
  showView("vMain");
  loadZalo(gen);
}

// Nút vào nhóm Zalo của lớp mình: link ở schedule/config.zalo[classId], chỉ hiện link https
async function loadZalo(my) {
  $("zaloBtn").hidden = true;
  if (!CLASSES[me.classId]) return;
  try {
    const cfg = await readDocument("schedule/config");
    if (my !== gen) return;
    const url = safeUrl(cfg?.zalo?.[me.classId]);
    $("zaloBtn").hidden = !url;
    if (url) $("zaloBtn").href = url;
  } catch (e) { console.warn(e.code || e); } // không đọc được thì chỉ ẩn nút, lịch vẫn hiện
}

// Lịch gom theo ngày: mỗi ngày một khối, mỗi buổi một dòng (giờ, chủ đề, phòng). Chưa được xếp lớp thì báo, không đoán lớp.
function renderSessions(cls) {
  $("mainTitle").textContent = cls ? cls.name : "Bạn chưa được xếp lớp";
  $("schedWrap").hidden = !cls;
  if (!cls) {
    $("mainSub").textContent = "Ban tổ chức đang xếp lớp. Trang này sẽ hiện lịch học của bạn khi xếp xong, hãy quay lại sau hoặc liên hệ ban tổ chức.";
    $("sessionList").replaceChildren();
    return;
  }
  const list = cls.sessions;
  const days = [...new Set(list.map(s => s.date))];
  $("mainSub").textContent = `${list.length} buổi, ${days.length} ngày, từ ${fmtDate(days[0])} đến ${fmtDate(days[days.length - 1], true)}. Bạn học đủ tất cả các buổi.`;
  $("sessionList").replaceChildren(...days.map(date => {
    const day = el("section", "sched-day");
    const head = el("h2", "sched-date");
    head.append(el("span", null, dowName(date)), el("span", "sched-dm", fmtDate(date, true)));
    day.append(head);
    list.forEach((s, i) => {
      if (s.date !== date) return;
      const row = el("div", "sched-row");
      const time = el("p", "sched-time");
      time.append(el("b", null, s.from), el("span", null, s.to));
      const body = el("div", "sched-body");
      body.append(el("p", "sched-no", `Buổi ${i + 1} · ${s.from < "12:00" ? "Sáng" : "Chiều"}`), el("p", "sched-topic", s.topic), el("p", "sched-room", s.room));
      row.append(time, body);
      day.append(row);
    });
    return day;
  }));
}

$("signInBtn").addEventListener("click", async () => {
  $("loginErr").textContent = "";
  try { await signInWithGoogle(); }
  catch (e) { if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") $("loginErr").textContent = "Đăng nhập chưa thành công: " + (e.code || e.message); }
});
// select_account cho chọn tài khoản khác
$("switchBtn").addEventListener("click", () => signInWithGoogle().catch(e => console.warn(e.code || e)));
$("signOutBtn").addEventListener("click", () => signOutUser());
$("sidForm").addEventListener("input", e => { $("sidErr").textContent = ""; e.target.removeAttribute("aria-invalid"); });
