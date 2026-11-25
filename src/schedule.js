// Trang /lich: sinh viên trong danh sách đăng nhập Google, kiểm tra lại thông tin, rồi xem lịch học chính thức
// của lớp mình (admin xếp lớp vào students/{email}.classId, lịch từng lớp nằm trong course.js). Quyền do firestore.rules kiểm soát.
import { signInWithGoogle, signOutUser, onUserChange, readDocument, updateStudentInfo } from "./lib/firebase.js";
import { MAJORS } from "./lib/majors.js";
import { enhanceSelects } from "./components/dropdown.js";
import { SID_RE, cleanSid } from "./lib/schedule.js";
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
}

// Mỗi buổi một dòng: số buổi, thứ, ngày, giờ, chủ đề và phòng. Chưa được xếp lớp thì báo, không đoán lớp.
function renderSessions(cls) {
  $("mainTitle").textContent = cls ? cls.name : "Bạn chưa được xếp lớp";
  if (!cls) {
    $("mainSub").textContent = "Ban tổ chức đang xếp lớp. Trang này sẽ hiện lịch học của bạn khi xếp xong, hãy quay lại sau hoặc liên hệ ban tổ chức.";
    $("sessionList").replaceChildren();
    return;
  }
  const list = cls.sessions;
  const days = [...new Set(list.map(s => s.date))];
  $("mainSub").textContent = `Lớp của bạn: ${list.length} buổi trong ${days.length} ngày, từ ${fmtDate(days[0])} đến ${fmtDate(days[days.length - 1], true)}. Bạn học đủ tất cả các buổi, có mặt đúng giờ và đúng phòng.`;
  $("sessionList").replaceChildren(...list.map((s, i) => {
    const li = el("li", s.from < "12:00" ? "is-am" : "is-pm");
    const head = el("p", "sess-head");
    head.append(el("b", null, `Buổi ${i + 1}`), ` · ${dowName(s.date)}, ${fmtDate(s.date, true)} · `, el("span", "sess-time", `${s.from} – ${s.to}`));
    li.append(head, el("p", "sess-topic", s.topic), el("p", "sess-room", "Địa điểm: " + s.room));
    return li;
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
