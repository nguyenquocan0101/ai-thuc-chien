// Trang /lich: sinh viên trong danh sách đăng nhập Google, kiểm tra lại thông tin, rồi xem lịch học chính thức
// của lớp mình (admin xếp lớp vào students/{email}.classId, lịch từng lớp nằm trong course.js). Quyền do firestore.rules kiểm soát.
import { signInWithGoogle, signInWithDemoRole, signOutUser, onUserChange, readDocument, watchDocument, updateStudentInfo } from "./lib/firebase.js";
import { MAJORS } from "./lib/majors.js";
import { enhanceSelects } from "./components/dropdown.js";
import { createClawdWalker } from "./components/clawd-walker.js";
import { SID_RE, cleanSid, safeUrl } from "./lib/schedule.js";
import { CLASSES } from "./scripts/course.js";
import { isAdminEmail } from "./lib/admins.js";
import "./styles/attendance.css";
import { distanceMeters, parseAttendanceQr } from "./lib/attendance.js";
import {
  retryAttendanceRecord, saveAttendanceRecord, watchAttendanceCurrent, watchAttendanceRecord,
  watchClassAttendanceSessions, watchStudentAttendanceRecords
} from "./lib/firebase.js";

const $ = id => document.getElementById(id);
const views = ["vLoading", "vLogin", "vMissing", "vSid", "vMain"];
const showView = id => views.forEach(v => { $(v).hidden = v !== id; });

let gen = 0;   // tăng mỗi lần đổi tài khoản, để bỏ kết quả của lần tải cũ
let me = null; // { email, name, studentId, major, term, classId }
let stopZalo = null;                // ngừng theo dõi schedule/config khi đổi tài khoản
let stopAttendance = null;
let stopStudentAttendanceRecord = null;
let cameraControls = null;
let cameraOpen = false;
let attendanceSession = null;
let attendanceRecord = null;
let classAttendanceSessions = [];
let studentAttendanceRecords = [];
let attendanceSessionsLoaded = false;
let studentAttendanceRecordsLoaded = false;
let stopClassAttendanceSessions = null;
let stopStudentAttendanceRecords = null;
const walker = createClawdWalker(); // Clawd đội biển Zalo bò quanh màn hình khi lớp có link

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
  setZalo("");
  if (stopZalo) { stopZalo(); stopZalo = null; }
  if (stopAttendance) { stopAttendance(); stopAttendance = null; }
  if (stopStudentAttendanceRecord) { stopStudentAttendanceRecord(); stopStudentAttendanceRecord = null; }
  if (stopClassAttendanceSessions) { stopClassAttendanceSessions(); stopClassAttendanceSessions = null; }
  if (stopStudentAttendanceRecords) { stopStudentAttendanceRecords(); stopStudentAttendanceRecords = null; }
  stopCamera();
  attendanceSession = null;
  attendanceRecord = null;
  classAttendanceSessions = [];
  studentAttendanceRecords = [];
  attendanceSessionsLoaded = false;
  studentAttendanceRecordsLoaded = false;
  $("who").hidden = !user;
  if (!user) { showView("vLogin"); return; }
  if (isAdminEmail(user.email)) {
    location.replace("/admin/");
    return;
  }
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
  $("studentAttendance").hidden = !CLASSES[me.classId];
  showView("vMain");
  if (!stopAttendance && CLASSES[me.classId]) {
    const my = gen;
    stopAttendance = watchAttendanceCurrent(current => {
      if (my !== gen) return;
      const previousSessionId = attendanceSession?.sessionId;
      attendanceSession = current;
      if (current?.sessionId !== previousSessionId) {
        attendanceRecord = null;
        stopStudentAttendanceRecord?.();
        stopStudentAttendanceRecord = null;
      }
      renderStudentAttendance();
      if (current?.sessionId && current.classId === me.classId && !stopStudentAttendanceRecord) watchMyAttendance(current.sessionId, my);
    }, e => fail(e, "studentAttendanceErr"));
  }
  if (!stopClassAttendanceSessions && CLASSES[me.classId]) {
    const my = gen;
    stopClassAttendanceSessions = watchClassAttendanceSessions(me.classId, sessions => {
      if (my !== gen) return;
      classAttendanceSessions = sessions;
      attendanceSessionsLoaded = true;
      renderSessions(CLASSES[me.classId]);
    }, e => fail(e, "studentAttendanceErr"));
    stopStudentAttendanceRecords = watchStudentAttendanceRecords(me.classId, me.email, records => {
      if (my !== gen) return;
      studentAttendanceRecords = records;
      studentAttendanceRecordsLoaded = true;
      renderSessions(CLASSES[me.classId]);
    }, e => fail(e, "studentAttendanceErr"));
  }
  // Link nhóm Zalo của lớp mình ở schedule/config.zalo[classId]: theo dõi trực tiếp, admin lưu là sinh viên thấy ngay
  if (!stopZalo && CLASSES[me.classId]) {
    const my = gen;
    stopZalo = watchDocument("schedule/config", cfg => { if (my === gen) setZalo(cfg?.zalo?.[me.classId]); },
      e => console.warn(e.code || e)); // không đọc được thì chỉ ẩn nút, lịch vẫn hiện
  }
}

function renderStudentAttendance() {
  const matching = attendanceSession?.active && attendanceSession.classId === me?.classId;
  const retryAllowed = attendanceRecord?.retryAllowed === true;
  $("studentAttendanceTitle").textContent = matching ? "Đang mở điểm danh" : "Chưa có phiên điểm danh";
  $("studentAttendanceInfo").textContent = matching
    ? `${attendanceSession.topic || "Buổi học"} · ${attendanceSession.date || ""} · ${attendanceSession.from || ""}–${attendanceSession.to || ""} · ${attendanceSession.room || ""}`
    : "Khi giảng viên bắt đầu phiên, nút quét QR sẽ xuất hiện ở đây.";
  $("scanAttendanceBtn").hidden = !matching || (!!attendanceRecord && !retryAllowed) || cameraOpen;
  $("scanAttendanceBtn").textContent = retryAllowed ? "Điểm danh lại" : "Quét QR điểm danh";
  $("scanAttendanceBtn").disabled = !!attendanceRecord && !retryAllowed;
  if (attendanceRecord) {
    const outcome = retryAllowed ? "Giảng viên đã cho phép điểm danh lại. Hãy quét QR mới trong lớp." : attendanceRecord.status === "present" ? "Điểm danh thành công." : attendanceRecord.status === "excused" ? "Đã được giảng viên duyệt ngoại lệ." : "Lần điểm danh này bị từ chối; hãy báo giảng viên nếu cần xét ngoại lệ.";
    $("studentAttendanceResult").textContent = `${outcome} Kết quả GPS gần nhất: ${attendanceRecord.gpsResult || "—"}; sai số: ${attendanceRecord.accuracyMeters == null ? "không có" : Math.round(attendanceRecord.accuracyMeters) + " m"}.`;
  } else $("studentAttendanceResult").textContent = "";
}

function watchMyAttendance(sessionId, generation) {
  const id = `${sessionId}_${me.email}`;
  stopStudentAttendanceRecord = watchAttendanceRecord(id, record => {
    if (generation === gen && attendanceSession?.sessionId === sessionId) {
      attendanceRecord = record;
      renderStudentAttendance();
    }
  }, e => { if (generation === gen) fail(e, "studentAttendanceErr"); });
}

function stopCamera() {
  cameraControls?.stop();
  cameraControls = null;
  cameraOpen = false;
  $("attendanceCamera").hidden = true;
  const retryAllowed = attendanceRecord?.retryAllowed === true;
  $("scanAttendanceBtn").hidden = !(attendanceSession?.active && attendanceSession.classId === me?.classId) || (!!attendanceRecord && !retryAllowed);
  $("scanAttendanceBtn").textContent = retryAllowed ? "Điểm danh lại" : "Quét QR điểm danh";
  $("scanAttendanceBtn").disabled = !!attendanceRecord && !retryAllowed;
}

async function handleAttendanceQr(raw) {
  const decoded = parseAttendanceQr(raw);
  if (!decoded) { $("studentAttendanceErr").textContent = "Mã QR không hợp lệ. Quét mã đang hiển thị trong lớp."; return; }
  const live = attendanceSession;
  const expiry = live?.tokenExpiresAt?.toMillis?.() || 0;
  if (!live?.active || live.classId !== me.classId || live.sessionId !== decoded.sessionId || live.currentToken !== decoded.token || expiry <= Date.now()) {
    $("studentAttendanceErr").textContent = "Mã đã hết hạn hoặc không thuộc phiên lớp của bạn. Hãy quét mã mới trên màn hình lớp.";
    return;
  }
  stopCamera();
  $("scanAttendanceBtn").hidden = true;
  $("scanAttendanceBtn").disabled = true;
  $("studentAttendanceErr").textContent = "Đang kiểm tra vị trí và gửi điểm danh…";
  try {
    const config = await readDocument("attendance/config");
    if (!config?.center || !Number.isFinite(config.radiusMeters) || !Number.isFinite(config.accuracyThresholdMeters)) throw new Error("Chưa có cấu hình phạm vi GPS của trường.");
    let gpsResult = "unavailable", accuracyMeters = null;
    if (navigator.geolocation) {
      try {
        const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
        // Tọa độ chỉ tồn tại trong bộ nhớ cho phép tính khoảng cách và không được gửi/lưu.
        const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        accuracyMeters = position.coords.accuracy;
        gpsResult = accuracyMeters > config.accuracyThresholdMeters
          ? "poor_accuracy"
          : distanceMeters(point, config.center) <= config.radiusMeters ? "inside" : "outside";
      } catch { gpsResult = "unavailable"; }
    }
    const status = gpsResult === "inside" ? "present" : "rejected";
    const id = `${decoded.sessionId}_${me.email}`;
    const submission = {
      sessionId: decoded.sessionId,
      classId: me.classId,
      studentEmail: me.email,
      studentName: me.name,
      status,
      gpsResult,
      accuracyMeters,
      token: decoded.token
    };
    if (attendanceRecord?.retryAllowed) {
      const attemptCount = (Number(attendanceRecord.attemptCount) || 1) + 1;
      await retryAttendanceRecord(id, { ...submission, attemptCount, retryAllowed: false });
      attendanceRecord = { ...attendanceRecord, ...submission, attemptCount, status, retryAllowed: false, submittedAt: new Date() };
    } else {
      await saveAttendanceRecord(id, submission);
      attendanceRecord = { id, ...submission, attemptCount: 1, status, submittedAt: new Date() };
    }
    renderStudentAttendance();
    $("studentAttendanceErr").textContent = status === "present"
      ? "Đã ghi nhận có mặt."
      : "Không thể tự động xác nhận vị trí; giảng viên có thể xem xét ngoại lệ có lý do.";
  } catch (e) {
    $("studentAttendanceErr").textContent = e.code === "permission-denied"
      ? "Điểm danh bị từ chối. Mã có thể đã hết hạn hoặc tài khoản đã có bản ghi cho buổi này."
      : `Không gửi được điểm danh: ${e.code || e.message}`;
    renderStudentAttendance();
  }
}

$("scanAttendanceBtn").addEventListener("click", async () => {
  $("studentAttendanceErr").textContent = "";
  if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    $("studentAttendanceErr").textContent = "Camera và GPS cần HTTPS trên điện thoại."; return;
  }
  if (!navigator.mediaDevices?.getUserMedia) { $("studentAttendanceErr").textContent = "Trình duyệt không hỗ trợ camera. Hãy mở trang này trên điện thoại bằng HTTPS."; return; }
  cameraOpen = true;
  $("scanAttendanceBtn").hidden = true;
  $("attendanceCamera").hidden = false;
  $("scanAttendanceBtn").disabled = true;
  try {
    const { BrowserQRCodeReader } = await import("@zxing/browser");
    const reader = new BrowserQRCodeReader();
    cameraControls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, $("attendanceVideo"), result => {
      if (result) handleAttendanceQr(result.getText());
    });
  } catch (e) {
    stopCamera();
    $("studentAttendanceErr").textContent = `Không mở được camera: ${e.message || e}`;
  }
});
$("stopAttendanceScan").addEventListener("click", stopCamera);

// Có link (https) thì Clawd giơ icon Zalo bò quanh màn hình (bấm vào là mở nhóm), Clawd ló đầu sau khung lịch nhường chỗ.
// Không có link thì không hiện gì.
function setZalo(raw) {
  const url = safeUrl(raw);
  $("schedWrap").classList.toggle("has-walker", !!url);
  if (url) walker.show(url); else walker.hide();
}

// Lịch gom theo ngày: mỗi ngày một khối, mỗi buổi một dòng (giờ, chủ đề, phòng). Chưa được xếp lớp thì báo, không đoán lớp.
function renderSessions(cls) {
  $("mainTitle").textContent = cls ? cls.name : "Bạn chưa được xếp lớp";
  $("schedWrap").hidden = !cls;
  $("mainSub").hidden = !!cls; // dòng phụ chỉ dùng để báo chưa xếp lớp
  if (!cls) {
    $("mainSub").textContent = "Ban tổ chức đang xếp lớp. Trang này sẽ hiện lịch học của bạn khi xếp xong, hãy quay lại sau hoặc liên hệ ban tổ chức.";
    $("sessionList").replaceChildren();
    return;
  }
  const list = cls.sessions;
  const days = [...new Set(list.map(s => s.date))];
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
      const status = attendanceStatusForSession(i);
      const statusLine = el("p", "sched-attendance-line");
      statusLine.append(el("span", "sched-attendance-label", "Điểm danh"), el("span", `sched-attendance sched-attendance-${status.kind}`, status.label));
      body.append(statusLine);
      row.append(time, body);
      day.append(row);
    });
    return day;
  }));
}

function attendanceStatusForSession(sessionIndex) {
  if (!attendanceSessionsLoaded || !studentAttendanceRecordsLoaded) return { kind: "pending", label: "Đang tải" };
  const matches = classAttendanceSessions
    .filter(session => session.classId === me?.classId && Number(session.sessionIndex) === sessionIndex)
    .sort((a, b) => attendanceStartedAt(b) - attendanceStartedAt(a));
  const latest = matches[0];
  if (!latest) return { kind: "pending", label: "Chưa mở" };
  const record = studentAttendanceRecords.find(item => item.sessionId === latest.sessionId);
  if (record?.retryAllowed) return { kind: "retry", label: "Được điểm danh lại" };
  if (record?.status === "present") return { kind: "present", label: "Có mặt" };
  if (record?.status === "excused") return { kind: "excused", label: "Ngoại lệ đã duyệt" };
  if (record?.status === "rejected") return { kind: "rejected", label: "Bị từ chối" };
  return latest.active
    ? { kind: "open", label: "Đang mở" }
    : { kind: "pending", label: "Chưa điểm danh" };
}

function attendanceStartedAt(session) {
  const value = session.startedAt;
  return value?.toMillis?.() ?? new Date(value || 0).getTime();
}

$("signInBtn").addEventListener("click", async () => {
  $("loginErr").textContent = "";
  try { await signInWithGoogle(); }
  catch (e) { if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") $("loginErr").textContent = "Đăng nhập chưa thành công: " + (e.code || e.message); }
});
if (import.meta.env.DEV) {
  $("demoLoginButtons").hidden = false;
  [["demoAdminBtn", "admin"], ["demoStudentBtn", "student"]].forEach(([id, role]) => {
    $(id).addEventListener("click", async () => {
      $("loginErr").textContent = "";
      try { await signInWithDemoRole(role); }
      catch (e) { $("loginErr").textContent = "Đăng nhập demo chưa thành công: " + (e.code || e.message); }
    });
  });
}
// select_account cho chọn tài khoản khác
$("switchBtn").addEventListener("click", () => signInWithGoogle().catch(e => console.warn(e.code || e)));
$("signOutBtn").addEventListener("click", () => signOutUser());
$("sidForm").addEventListener("input", e => { $("sidErr").textContent = ""; e.target.removeAttribute("aria-invalid"); });
