// Trang /lich: sinh viên trong danh sách đăng nhập Google, bổ sung MSSV nếu thiếu, chọn học ca sáng hoặc ca chiều,
// rồi xem lớp của ca đó khi ban tổ chức công bố. Quyền đọc/ghi do firestore.rules kiểm soát.
import { signInWithGoogle, signOutUser, onUserChange, readDocument, watchDocument, saveDocument, fillStudentId } from "./lib/firebase.js";
import { STATUS, SHIFTS, SID_RE, cleanSid, parseSession, sessionLabel, dayLabel, shiftOf as shiftOfIds, safeUrl } from "./lib/schedule.js";

const $ = id => document.getElementById(id);
const views = ["vLoading", "vLogin", "vMissing", "vSid", "vMain"];
const showView = id => views.forEach(v => { $(v).hidden = v !== id; });

const COPY = {
  draft: ["Chưa mở đăng ký lịch", "Ban tổ chức sẽ mở đăng ký lịch sớm. Trang này tự cập nhật khi đăng ký mở."],
  open: ["Chọn ca học của bạn", "Chọn học buổi sáng hoặc buổi chiều. Bạn học ca đó vào mọi ngày thứ 2 – thứ 6 trong đợt học. Đổi được cho tới khi ban tổ chức đóng đăng ký."],
  closed: ["Đã đóng đăng ký lịch", "Ban tổ chức sẽ công bố lớp sớm. Dưới đây là ca bạn đã chọn."],
  published: ["Lớp của bạn", "Lớp theo ca bạn đã chọn. Lưu lại lịch học và vào nhóm Zalo của lớp."]
};

let gen = 0;            // tăng mỗi lần đổi tài khoản, để bỏ kết quả của lần tải cũ
let me = null;          // { email, name, studentId }
let config = null;      // schedule/config
let picked = new Set(); // buổi đang chọn trên màn hình: mọi buổi của ca sáng hoặc ca chiều
let saved = new Set();  // buổi đã lưu trên Firestore
let savedAt = null;
let saving = false;
let result;             // undefined = chưa tải; { classes } sau khi công bố
let stopConfig = null;

const sessions = () => config?.sessions || [];
const valid = set => [...set].filter(id => sessions().includes(id)).sort();
const isDirty = () => valid(picked).join() !== valid(saved).join();
const ofShift = shift => sessions().filter(id => parseSession(id).shift === shift);
// Ca của một tập buổi: chỉ khi mọi buổi cùng một ca (dữ liệu chọn lẻ từng buổi trước đây thì coi như chưa chọn ca)
const shiftOf = set => shiftOfIds(valid(set));
const pad = n => String(n).padStart(2, "0");
const fmtTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
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
  me = null; config = null; result = undefined; picked = new Set(); saved = new Set(); savedAt = null;
  $("who").hidden = !user;
  if (!user) { showView("vLogin"); return; }
  $("whoMail").textContent = user.email;
  showView("vLoading");
  const email = String(user.email || "").toLowerCase();
  try {
    const stu = await readDocument(`students/${email}`);
    if (my !== gen) return;
    if (!stu) { $("missingMail").textContent = user.email; showView("vMissing"); return; }
    me = { email, name: stu.name || user.displayName || email, studentId: stu.studentId || "" };
    if (me.studentId) await enterMain(my); else askSid();
  } catch (e) {
    if (my !== gen) return;
    showView("vLogin");
    fail(e, "loginErr");
  }
});

function askSid() {
  $("sidName").textContent = me.name;
  $("sidErr").textContent = "";
  showView("vSid");
  $("sidInput").focus();
}

$("sidForm").addEventListener("submit", async e => {
  e.preventDefault();
  const sid = cleanSid($("sidInput").value);
  if (!SID_RE.test(sid)) {
    $("sidErr").textContent = "MSSV gồm 2 chữ cái và 6 chữ số, ví dụ SE123456.";
    $("sidInput").setAttribute("aria-invalid", "true");
    $("sidInput").focus();
    return;
  }
  $("sidInput").removeAttribute("aria-invalid");
  $("sidBtn").disabled = true;
  const my = gen;
  try {
    await fillStudentId(me.email, sid);
    if (my !== gen) return;
    me.studentId = sid;
    await enterMain(my);
  } catch (err) {
    fail(err, "sidErr");
  } finally {
    $("sidBtn").disabled = false;
  }
});

async function enterMain(my) {
  const av = await readDocument(`availability/${me.email}`);
  if (my !== gen) return;
  saved = new Set(av?.sessionIds || []);
  picked = new Set(saved);
  savedAt = av?.updatedAt?.toDate?.() || null;
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
  $("statusPill").textContent = STATUS[st];
  $("statusPill").dataset.s = st;
  $("mainTitle").textContent = COPY[st][0];
  $("mainSub").textContent = COPY[st][1];
  $("pickBox").hidden = st !== "open" && st !== "closed";
  $("resultBox").hidden = st !== "published";
  if (st === "open" || st === "closed") renderPick(st === "closed");
  if (st === "published") renderResult();
}

// Hai lựa chọn ca sáng / ca chiều; chọn một ca là chọn mọi buổi của ca đó trong đợt học
function renderPick(readOnly) {
  $("saveBar").hidden = readOnly;
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
    input.disabled = readOnly;
    input.addEventListener("change", () => { picked = new Set(ids); updateBar(); });
    const body = el("span", "shift-body");
    body.append(
      el("span", "shift-name", `Buổi ${s.name.toLowerCase()}`),
      el("span", "shift-time", s.time),
      el("span", "shift-days", `${ids.length} buổi · ${dayLabel(parseSession(ids[0]).date)} – ${dayLabel(parseSession(ids[ids.length - 1]).date)}`)
    );
    label.append(input, body);
    return label;
  }).filter(Boolean);
  box.replaceChildren(legend, ...opts);
  updateBar();
}

function updateBar() {
  const shift = shiftOf(picked), dirty = isDirty();
  $("pickCount").textContent = shift ? `Ca ${SHIFTS[shift].name.toLowerCase()} · ${valid(picked).length} buổi` : "Chưa chọn ca";
  $("saveHint").textContent = saving ? "Đang lưu…"
    : dirty ? "Có thay đổi chưa lưu"
    : savedAt ? `Đã lưu lúc ${fmtTime(savedAt)}` : "Chưa lưu lần nào";
  $("saveBtn").disabled = saving || !dirty;
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

$("saveBtn").addEventListener("click", async () => {
  const ids = valid(picked);
  saving = true; updateBar();
  try {
    await saveDocument(`availability/${me.email}`, { sessionIds: ids });
    saved = new Set(ids);
    savedAt = new Date();
    $("mainErr").textContent = "";
  } catch (e) {
    fail(e);
  } finally {
    saving = false; updateBar();
  }
});

window.addEventListener("beforeunload", e => {
  if (config?.status === "open" && isDirty()) e.preventDefault();
});

$("signInBtn").addEventListener("click", async () => {
  $("loginErr").textContent = "";
  try { await signInWithGoogle(); }
  catch (e) { if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") $("loginErr").textContent = "Đăng nhập chưa thành công: " + (e.code || e.message); }
});
// Mở popup ngay trong lượt bấm (await trước đó sẽ bị chặn popup); select_account cho chọn tài khoản khác
$("switchBtn").addEventListener("click", () => signInWithGoogle().catch(e => console.warn(e.code || e)));
$("signOutBtn").addEventListener("click", () => signOutUser());
$("sidInput").addEventListener("input", () => { $("sidErr").textContent = ""; $("sidInput").removeAttribute("aria-invalid"); });
