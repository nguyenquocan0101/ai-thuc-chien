// Trang /lich: sinh viên trong danh sách đăng nhập Google, bổ sung MSSV nếu thiếu, chọn các buổi đi học được,
// rồi xem lớp được xếp khi ban tổ chức công bố. Quyền đọc/ghi do firestore.rules kiểm soát.
import { signInWithGoogle, signOutUser, onUserChange, readDocument, watchDocument, saveDocument, fillStudentId } from "./lib/firebase.js";
import { STATUS, SID_RE, cleanSid, parseSession, sessionLabel, safeUrl } from "./lib/schedule.js";
import { sessionGrid } from "./components/session-grid.js";

const $ = id => document.getElementById(id);
const views = ["vLoading", "vLogin", "vMissing", "vSid", "vMain"];
const showView = id => views.forEach(v => { $(v).hidden = v !== id; });

const COPY = {
  draft: ["Chưa mở đăng ký lịch", "Ban tổ chức sẽ mở đăng ký lịch sớm. Trang này tự cập nhật khi đăng ký mở."],
  open: ["Chọn các buổi bạn đi học được", "Bấm vào buổi để chọn hoặc bỏ chọn. Chọn bao nhiêu buổi cũng được, và sửa được cho tới khi ban tổ chức đóng đăng ký."],
  closed: ["Đã đóng đăng ký lịch", "Ban tổ chức đang xếp lớp dựa trên lịch rảnh của mọi người. Dưới đây là các buổi bạn đã chọn."],
  published: ["Lớp của bạn", "Ban tổ chức đã xếp lớp. Lưu lại lịch học và vào nhóm Zalo của lớp."]
};

let gen = 0;            // tăng mỗi lần đổi tài khoản, để bỏ kết quả của lần tải cũ
let me = null;          // { email, name, studentId }
let config = null;      // schedule/config
let picked = new Set(); // buổi đang chọn trên màn hình
let saved = new Set();  // buổi đã lưu trên Firestore
let savedAt = null;
let saving = false;
let result;             // undefined = chưa tải; { cls } sau khi công bố
let stopConfig = null;

const sessions = () => config?.sessions || [];
const valid = set => [...set].filter(id => sessions().includes(id)).sort();
const isDirty = () => valid(picked).join() !== valid(saved).join();
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
  const [cls, asg] = await Promise.all([readDocument("schedule/classes"), readDocument(`assignments/${me.email}`)]);
  if (my !== gen) return;
  result = { cls: (cls?.classes || []).find(c => c.id === asg?.classId) || null };
}

function render() {
  const st = STATUS[config.status] ? config.status : "draft";
  $("statusPill").textContent = STATUS[st];
  $("statusPill").dataset.s = st;
  $("mainTitle").textContent = COPY[st][0];
  $("mainSub").textContent = COPY[st][1];
  $("pickBox").hidden = st !== "open" && st !== "closed";
  $("resultBox").hidden = st !== "published";
  if (st === "open" || st === "closed") renderGrid(st === "closed");
  if (st === "published") renderResult();
}

function renderGrid(readOnly) {
  $("pickTools").hidden = readOnly;
  $("saveBar").hidden = readOnly;
  if (readOnly && !valid(saved).length) {
    $("grid").replaceChildren(el("p", "card empty muted", "Bạn chưa chọn buổi nào trước khi đóng đăng ký. Liên hệ ban tổ chức nếu bạn vẫn muốn tham gia."));
    return;
  }
  $("grid").replaceChildren(sessionGrid({ ids: sessions(), selected: readOnly ? saved : picked, readOnly, onChange: updateBar }));
  updateBar();
}

function updateBar() {
  const n = valid(picked).length, dirty = isDirty();
  $("pickCount").textContent = `Đã chọn ${n} / ${sessions().length} buổi`;
  $("saveHint").textContent = saving ? "Đang lưu…"
    : dirty ? "Có thay đổi chưa lưu"
    : savedAt ? `Đã lưu lúc ${fmtTime(savedAt)}` : "Chưa lưu lần nào";
  $("saveBtn").disabled = saving || !dirty;
}

function renderResult() {
  const box = $("resultBox");
  const cls = result?.cls;
  if (!cls) {
    box.replaceChildren(el("h2", null, "Bạn chưa được xếp lớp"), el("p", "muted", "Liên hệ ban tổ chức để được hỗ trợ xếp lớp."));
    return;
  }
  const ids = valid(new Set(cls.sessionIds || []));
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

$("pickTools").addEventListener("click", e => {
  const kind = e.target.closest("[data-pick]")?.dataset.pick;
  if (!kind) return;
  if (kind === "none") picked.clear();
  else sessions().forEach(id => { if (parseSession(id).shift === kind) picked.add(id); });
  renderGrid(false);
});

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
