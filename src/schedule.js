// Trang /lich: sinh viên trong danh sách đăng nhập Google, bổ sung MSSV nếu thiếu, chọn học ca sáng hoặc ca chiều,
// rồi xem lớp của ca đó khi ban tổ chức công bố. Quyền đọc/ghi do firestore.rules kiểm soát.
import { signInWithGoogle, signOutUser, onUserChange, readDocument, watchDocument, saveDocument, updateStudentInfo } from "./lib/firebase.js";
import { MAJORS } from "./lib/majors.js";
import { enhanceSelects } from "./components/dropdown.js";
import { STATUS, SHIFTS, SID_RE, cleanSid, parseSession, sessionLabel, shiftOf as shiftOfIds, safeUrl } from "./lib/schedule.js";

const $ = id => document.getElementById(id);
const views = ["vLoading", "vLogin", "vMissing", "vSid", "vMain"];
const showView = id => views.forEach(v => { $(v).hidden = v !== id; });

const COPY = {
  draft: ["Chưa mở đăng ký lịch", "Ban tổ chức sẽ mở đăng ký lịch sớm. Trang này tự cập nhật khi đăng ký mở."],
  open: ["Chọn ca học", ""],
  closed: ["Đã đóng đăng ký", "Ban tổ chức sẽ công bố lớp sớm. Đây là ca bạn đã chọn."],
  published: ["Lớp của bạn", "Lớp theo ca bạn đã chọn. Lưu lại lịch học và vào nhóm Zalo của lớp."]
};

let gen = 0;            // tăng mỗi lần đổi tài khoản, để bỏ kết quả của lần tải cũ
let me = null;          // { email, name, studentId }
let config = null;      // schedule/config
let picked = new Set(); // buổi đang chọn trên màn hình: mọi buổi của ca sáng hoặc ca chiều
let saved = new Set();  // buổi đã lưu trên Firestore
let saving = false;
let result;             // undefined = chưa tải; { classes } sau khi công bố
let stopConfig = null;

const sessions = () => config?.sessions || [];
const valid = set => [...set].filter(id => sessions().includes(id)).sort();
const ofShift = shift => sessions().filter(id => parseSession(id).shift === shift);
// Ca của một tập buổi: chỉ khi mọi buổi cùng một ca (dữ liệu chọn lẻ từng buổi trước đây thì coi như chưa chọn ca)
const shiftOf = set => shiftOfIds(valid(set));
const isDirty = () => valid(picked).join() !== valid(saved).join();
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
  if (stopConfig) { stopConfig(); stopConfig = null; }
  me = null; config = null; result = undefined; picked = new Set(); saved = new Set();
  $("who").hidden = !user;
  if (!user) { showView("vLogin"); return; }
  $("whoMail").textContent = user.email;
  showView("vLoading");
  const email = String(user.email || "").toLowerCase();
  try {
    const stu = await readDocument(`students/${email}`);
    if (my !== gen) return;
    if (!stu) { $("missingMail").textContent = user.email; showView("vMissing"); return; }
    me = { email, name: stu.name || user.displayName || "", studentId: stu.studentId || "", major: stu.major || "", term: stu.term || "" };
    // Lần đầu vào: kiểm tra lại thông tin đăng ký trước khi chọn ca
    if (stu.infoConfirmedAt && me.studentId) await enterMain(my); else askInfo(false);
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
    if (stopConfig) { stopConfig(); stopConfig = null; }
    await enterMain(my);
  } catch (err) {
    fail(err, "sidErr");
  } finally {
    $("sidBtn").disabled = false;
  }
});
$("infoBack").addEventListener("click", () => showView("vMain"));
$("infoEdit").addEventListener("click", () => askInfo(true));

async function enterMain(my) {
  const av = await readDocument(`availability/${me.email}`);
  if (my !== gen) return;
  saved = new Set(av?.sessionIds || []);
  picked = new Set(saved);
  $("meName").textContent = me.name;
  $("meSid").textContent = me.studentId;
  $("mainErr").textContent = "";
  showView("vMain");
  stopConfig = watchDocument("schedule/config", async c => {
    config = c || { status: "draft", sessions: [] };
    if (config.status !== "published") result = undefined;
    else if (result === undefined) {
      try { await loadResult(my); } catch (e) { fail(e); }
      if (my !== gen) return;
    }
    render();
  }, fail);
}

async function loadResult(my) {
  const doc = await readDocument("schedule/classes");
  if (my !== gen) return;
  result = { classes: doc?.classes || [] };
}

function render() {
  const st = STATUS[config.status] ? config.status : "draft";
  $("mainTitle").textContent = COPY[st][0];
  $("mainSub").classList.toggle("intro", st === "open");
  if (st === "open") renderIntro(); else $("mainSub").textContent = COPY[st][1];
  $("pickBox").hidden = st !== "open" && st !== "closed";
  $("resultBox").hidden = st !== "published";
  if (st === "open" || st === "closed") renderPick(st === "closed");
  if (st === "published") renderResult();
}

// Khi đang mở đăng ký: nói rõ thời gian học và cách chọn, ngày lấy từ buổi đầu và buổi cuối của lịch
function renderIntro() {
  const days = sessions().map(id => parseSession(id).date).sort();
  const p = $("mainSub");
  if (!days.length) { p.textContent = ""; return; }
  const row = (label, value) => { const li = el("li"); li.append(el("span", "fact-k", label), typeof value === "string" ? el("b", null, value) : value); return li; };
  // Mỗi ca một dòng: "Sáng: bắt đầu từ 7:30 đến 11:30"
  const shifts = el("span", "fact-shifts");
  Object.values(SHIFTS).forEach(s => {
    const [from, to] = s.time.match(/\d{1,2}:\d{2}/g);
    const line = el("span");
    line.append(el("b", null, s.name), ": bắt đầu từ ", el("span", "nowrap", `${from} đến ${to}`));
    shifts.append(line);
  });
  const list = el("ul", "facts-list");
  list.append(
    row("Thời gian", `${fmtDate(days[0])} – ${fmtDate(days[days.length - 1], true)}`),
    row("Lịch học", "Thứ 2 – Thứ 6"),
    row("Ca học", shifts)
  );
  p.replaceChildren(list);
}

// Hai lựa chọn ca sáng / ca chiều; chọn một ca là chọn mọi buổi của ca đó, bấm Xác nhận mới lưu
function renderPick(readOnly) {
  const box = $("shiftPick");
  const legend = box.querySelector("legend");
  const current = shiftOf(readOnly ? saved : picked);
  if (readOnly && !current) {
    box.replaceChildren(legend, el("p", "card empty muted", "Bạn chưa chọn ca học trước khi đóng đăng ký. Liên hệ ban tổ chức nếu bạn vẫn muốn tham gia."));
    return;
  }
  const opts = Object.entries(SHIFTS).map(([shift, s]) => {
    const ids = ofShift(shift);
    if (!ids.length || (readOnly && shift !== current)) return null;
    const label = el("label", "shift-opt");
    const input = el("input");
    input.type = "radio"; input.name = "shift"; input.value = shift;
    input.checked = shift === current;
    input.disabled = readOnly || saving;
    input.addEventListener("change", () => { picked = new Set(ids); updateHint(); });
    const body = el("span", "shift-body");
    const first = parseSession(ids[0]).date, last = parseSession(ids[ids.length - 1]).date;
    body.append(el("span", "shift-name", s.name), el("span", "shift-time", s.time),
      el("span", "shift-days", `Thứ 2 – thứ 6, từ ${fmtDate(first)} đến ${fmtDate(last, true)}`));
    label.append(input, body);
    return label;
  }).filter(Boolean);
  box.replaceChildren(legend, ...opts);
  updateHint(readOnly);
}

function updateHint(readOnly = config?.status !== "open") {
  $("confirmRow").hidden = readOnly;
  const done = shiftOf(saved), chosen = shiftOf(picked), dirty = isDirty();
  const line = $("saveHint");
  line.dataset.ok = done && !dirty && !saving ? "1" : "";
  line.textContent = saving ? "Đang lưu…"
    : dirty && chosen ? `Bạn chọn ca ${SHIFTS[chosen].name.toLowerCase()}. Bấm Xác nhận để lưu.`
    : done ? `Đã xác nhận ca ${SHIFTS[done].name.toLowerCase()}. Bạn có thể đổi ca cho tới khi đóng đăng ký.`
    : "Chọn một ca rồi bấm Xác nhận.";
  $("saveBtn").disabled = saving || !dirty || !chosen;
}

async function saveShift() {
  if (!isDirty() || !shiftOf(picked)) return;
  saving = true; updateHint();
  document.querySelectorAll('#shiftPick input').forEach(i => { i.disabled = true; });
  try {
    await saveDocument(`availability/${me.email}`, { sessionIds: valid(picked) });
    saved = new Set(picked);
    $("mainErr").textContent = "";
  } catch (e) {
    fail(e); // lưu không được (vd. vừa đóng đăng ký): giữ lựa chọn trên màn hình để thử lại
  } finally {
    saving = false;
    if (config) render();
  }
}

function renderResult() {
  const box = $("resultBox");
  // Lớp của sinh viên là lớp của ca đã chọn; buổi học lấy theo ca trên lịch hiện tại
  const shift = shiftOf(saved);
  const cls = shift && (result?.classes || []).find(c => shiftOfIds(valid(new Set(c.sessionIds || []))) === shift);
  if (!cls) {
    box.replaceChildren(el("h2", null, "Bạn chưa có lớp"), el("p", "muted", "Bạn chưa chọn ca học trước khi đóng đăng ký. Liên hệ ban tổ chức để được hỗ trợ."));
    return;
  }
  const ids = valid(new Set(sessions().filter(id => parseSession(id).shift === shift)));
  const list = el("ul", "result-list");
  ids.forEach(id => {
    const { shift } = parseSession(id);
    const li = el("li", shift === "pm" ? "is-pm" : "is-am");
    li.textContent = sessionLabel(id);
    list.append(li);
  });
  box.replaceChildren(el("p", "eyebrow", "Bạn học"), el("h2", "result-name", cls.name || "Lớp"), el("p", "muted", `${ids.length} buổi`), list);
  const zalo = safeUrl(cls.zalo);
  if (zalo) {
    const a = el("a", "btn btn-primary", "Vào nhóm Zalo của lớp");
    a.href = zalo; a.target = "_blank"; a.rel = "noopener";
    box.append(a);
  }
}


$("signInBtn").addEventListener("click", async () => {
  $("loginErr").textContent = "";
  try { await signInWithGoogle(); }
  catch (e) { if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") $("loginErr").textContent = "Đăng nhập chưa thành công: " + (e.code || e.message); }
});
// Mở popup ngay trong lượt bấm (await trước đó sẽ bị chặn popup); select_account cho chọn tài khoản khác
$("saveBtn").addEventListener("click", saveShift);
// Đã chọn ca khác mà chưa xác nhận: hỏi lại trước khi rời trang
window.addEventListener("beforeunload", e => { if (config?.status === "open" && isDirty()) e.preventDefault(); });
$("switchBtn").addEventListener("click", () => signInWithGoogle().catch(e => console.warn(e.code || e)));
$("signOutBtn").addEventListener("click", () => signOutUser());
$("sidForm").addEventListener("input", e => { $("sidErr").textContent = ""; e.target.removeAttribute("aria-invalid"); });
