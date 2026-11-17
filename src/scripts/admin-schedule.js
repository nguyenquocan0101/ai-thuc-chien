// Phần đăng ký lịch học trên trang admin: danh sách sinh viên, buổi học, lớp, tổng hợp lịch rảnh và xếp lớp.
// Dữ liệu: students/{email}, schedule/config, schedule/classes, availability/{email}, assignments/{email}.
import { watchCollection, watchDocument, saveDocument, writeDocuments } from "../lib/firebase.js";
import { STATUS, SID_RE, cleanSid, parseSession, weekdaySessions, safeUrl } from "../lib/schedule.js";
import { sessionGrid } from "../components/session-grid.js";
import { createDropdown } from "../components/dropdown.js";
import { arrange, fitCount } from "../lib/arrange.js";
import { downloadCsv } from "../lib/csv.js";

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const fold = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
const EMAIL_RE = /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/;
const DEFAULT_RANGE = { from: "2026-11-23", to: "2026-12-04" }; // tuần 12–13
const STATUS_HINT = {
  draft: "Sinh viên đăng nhập và bổ sung MSSV được, nhưng chưa chọn buổi.",
  open: "Sinh viên chọn và sửa các buổi rảnh của mình.",
  closed: "Sinh viên chỉ xem lại các buổi đã chọn. Dùng trạng thái này khi xếp lớp.",
  published: "Sinh viên thấy lớp, các buổi học và link Zalo của mình."
};

let ctx;                 // { majors, registrations: () => [] }
let students = [];       // students/*
let config = null;       // schedule/config (null = chưa có)
let classes = [];        // schedule/classes.classes đã lưu
let avail = new Map();   // email → sessionIds
let assigns = new Map(); // email → classId đã lưu
let loaded = new Set();  // các nguồn đã tải xong lần đầu
let sessDraft = null;    // { from, to, off: Set } đang sửa
let classDraft = null;   // [{ id, name, capacity, zalo, sessionIds: Set }] đang sửa
let classEdited = false; // admin đã sửa bản nháp lớp (khi đó dữ liệu mới không ghi đè lên)
let arrDraft = null;     // Map email → classId ("" = chưa xếp) khi có thay đổi chưa lưu
let importPlan = null;

const sessions = () => config?.sessions || [];
const validIds = ids => { const have = new Set(sessions()); return (ids || []).filter(id => have.has(id)); };
const className = id => classes.find(c => c.id === id)?.name || "";
const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi") || a.id.localeCompare(b.id);

function showErr(e) {
  if (e) console.error(e);
  $("schErr").textContent = e
    ? (e.code === "permission-denied" ? "Firestore từ chối thao tác. Kiểm tra rules đã deploy và email này là admin." : "Lỗi: " + (e.code || e.message))
    : "";
}

export function startSchedule(context) {
  ctx = context;
  loaded = new Set();
  const done = name => { loaded.add(name); };
  const stops = [
    watchCollection("students", rows => { students = rows.sort(byName); done("students"); renderStudents(); renderClasses(false); renderArrange(); }, showErr),
    watchDocument("schedule/config", c => { config = c; done("config"); onConfig(); }, showErr),
    watchDocument("schedule/classes", c => { classes = c?.classes || []; done("classes"); onClasses(); }, showErr),
    watchCollection("availability", rows => { avail = new Map(rows.map(r => [r.id, r.sessionIds || []])); done("avail"); renderStudents(); renderArrange(); }, showErr),
    watchCollection("assignments", rows => { assigns = new Map(rows.map(r => [r.id, r.classId])); done("assigns"); renderStudents(); renderArrange(); }, showErr)
  ];
  $("studentLink").textContent = location.origin + "/lich";
  $("studentLink").href = "/lich/" + location.search;
  return () => stops.forEach(stop => stop());
}

// ---------- Sinh viên ----------

function renderStudents() {
  const q = fold($("stuQ").value);
  const list = students.filter(s => !q || fold([s.name, s.email, s.studentId].join(" ")).includes(q));
  $("stuRows").replaceChildren(...list.map((s, i) => {
    const tr = el("tr");
    const n = avail.has(s.id) ? validIds(avail.get(s.id)).length : null;
    const cells = [
      [String(i + 1), "mono"], [s.name], [s.email], [s.studentId || "Thiếu", s.studentId ? "mono" : "mono miss"],
      [s.term ? "Kỳ " + s.term : "—", "mono"], [n == null ? "Chưa báo" : `${n} buổi`, n == null ? "miss" : ""], [className(assigns.get(s.id)) || "—"]
    ];
    cells.forEach(([v, cls]) => tr.append(el("td", cls || "", v || "—")));
    return tr;
  }));
  ctx.setBadge?.("sinh-vien", students.length ? String(students.length) : "");
  const withSid = students.filter(s => s.studentId).length;
  const reported = students.filter(s => avail.has(s.id)).length;
  $("stuSummary").textContent = students.length
    ? `${students.length} sinh viên · ${withSid} có MSSV · ${reported} đã báo lịch`
    : "Chưa có sinh viên nào. Nhập danh sách từ Google Sheet bên dưới.";
  $("stuEmpty").hidden = list.length > 0;
  $("stuEmpty").textContent = students.length ? "Không có kết quả phù hợp." : "Chưa có sinh viên.";
  if (loaded.has("students") && !students.length) $("importBox").open = true;
}

function exportStudents() {
  const head = ["STT", "Họ tên", "Email", "MSSV", "Ngành", "Kỳ", "Số buổi rảnh", "Lớp"];
  downloadCsv("sinh-vien-lich-hoc", head, students.map((s, i) => [
    i + 1, s.name, s.email, s.studentId || "", ctx.majors[s.major] || s.major || "", s.term || "",
    avail.has(s.id) ? validIds(avail.get(s.id)).length : "", className(assigns.get(s.id))
  ]));
}

// Nhận cột theo tiêu đề (bỏ dấu): "Họ tên", "Email", "MSSV", "Ngành", "Kỳ". "Đăng ký lúc" không bị nhận nhầm là cột kỳ.
const IMPORT_COLS = [["email", /e-?mail/], ["studentId", /mssv|ma so|student id/], ["major", /nganh|major/], ["term", /^ky$|hoc ky|term|semester/], ["name", /ho ten|ten|name/]];

function planImport(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).map(l => l.split("\t").map(c => c.trim()));
  if (lines.length < 2) return { error: "Chưa có dữ liệu. Copy cả dòng tiêu đề lẫn các dòng sinh viên trong Sheet." };
  const col = {};
  lines[0].map(fold).forEach((h, i) => {
    const hit = IMPORT_COLS.find(([key, re]) => col[key] === undefined && re.test(h));
    if (hit) col[hit[0]] = i;
  });
  if (col.email === undefined) return { error: 'Dòng đầu phải là tiêu đề và có cột "Email". Hãy copy cả dòng tiêu đề trong Sheet.' };

  const majorCode = v => {
    const f = fold(v);
    return Object.entries(ctx.majors).find(([code, name]) => fold(code) === f || fold(name) === f)?.[0] || (v ? "OTHER" : "");
  };
  const regs = new Map(ctx.registrations().map(r => [String(r.email || "").toLowerCase(), r]));
  const existing = new Map(students.map(s => [s.id, s]));
  const rows = new Map(), bad = [], dupEmail = [];
  for (const cells of lines.slice(1)) {
    const get = key => (col[key] === undefined ? "" : cells[col[key]] || "");
    const email = get("email").toLowerCase();
    if (!EMAIL_RE.test(email)) { bad.push(cells.filter(Boolean).join(" · ")); continue; }
    if (rows.has(email)) dupEmail.push(email);
    const old = existing.get(email), reg = regs.get(email);
    const pasted = cleanSid(get("studentId"));
    const fallback = old?.studentId || (SID_RE.test(reg?.studentId || "") ? reg.studentId : "");
    rows.set(email, {
      email,
      name: get("name") || old?.name || reg?.name || "",
      studentId: SID_RE.test(pasted) ? pasted : fallback,
      major: majorCode(get("major")) || old?.major || reg?.major || "",
      term: get("term").replace(/\D/g, "") || old?.term || reg?.term || "",
      sidFromFirestore: !SID_RE.test(pasted) && !!fallback,
      badSid: pasted && !SID_RE.test(pasted) ? pasted : ""
    });
  }
  const list = [...rows.values()];
  const owners = new Map();
  list.filter(r => r.studentId).forEach(r => owners.set(r.studentId, [...(owners.get(r.studentId) || []), r.email]));
  const changed = list.filter(r => {
    const o = existing.get(r.email);
    return !o || ["name", "studentId", "major", "term"].some(k => (o[k] || "") !== r[k]);
  });
  return {
    list, changed, bad, dupEmail,
    added: list.filter(r => !existing.has(r.email)).length,
    removed: students.filter(s => !rows.has(s.id)),
    dupSid: [...owners].filter(([, emails]) => emails.length > 1),
    fromFirestore: list.filter(r => r.sidFromFirestore && !existing.get(r.email)?.studentId),
    badSid: list.filter(r => r.badSid),
    noSid: list.filter(r => !r.studentId).length
  };
}

function renderImport() {
  const box = $("importResult");
  const p = importPlan;
  if (!p) { box.replaceChildren(); return; }
  if (p.error) { box.replaceChildren(el("p", "err", p.error)); return; }
  const facts = el("ul", "facts");
  const add = (text, warn = false) => facts.append(el("li", warn ? "warn" : "", text));
  add(`${p.list.length} sinh viên hợp lệ: ${p.added} mới, ${p.changed.length - p.added} cần cập nhật, ${p.list.length - p.changed.length} không đổi.`);
  if (p.fromFirestore.length) add(`MSSV lấy từ đơn đăng ký: ${p.fromFirestore.map(r => `${r.name} (${r.studentId})`).join(", ")}.`);
  add(`${p.noSid} sinh viên chưa có MSSV, sẽ được hỏi khi đăng nhập.`);
  if (p.badSid.length) add(`MSSV sai định dạng, coi như trống: ${p.badSid.map(r => `${r.email} (${r.badSid})`).join(", ")}.`, true);
  if (p.bad.length) add(`${p.bad.length} dòng bỏ qua vì email không hợp lệ: ${p.bad.slice(0, 5).join(" | ")}${p.bad.length > 5 ? " …" : ""}`, true);
  if (p.dupEmail.length) add(`Email lặp lại, lấy dòng cuối: ${p.dupEmail.join(", ")}.`, true);
  p.dupSid.forEach(([sid, emails]) => add(`MSSV ${sid} trùng ở ${emails.length} email: ${emails.join(", ")}. Xoá dòng thừa trong bản dán nếu là cùng một người.`, true));
  const nodes = [facts];
  let removeBox = null;
  if (p.removed.length) {
    const label = el("label", "tick");
    removeBox = el("input"); removeBox.type = "checkbox";
    label.append(removeBox, el("span", null, ` Xoá ${p.removed.length} sinh viên đang có nhưng không còn trong bản dán: ${p.removed.map(s => s.email).join(", ")}`));
    nodes.push(label);
  }
  const go = el("button", "btn btn-primary", p.changed.length ? `Lưu ${p.changed.length} sinh viên` : "Lưu");
  go.type = "button";
  go.disabled = !p.changed.length && !p.removed.length;
  go.addEventListener("click", async () => {
    const ops = p.changed.map(r => ({ path: `students/${r.email}`, data: { name: r.name, email: r.email, studentId: r.studentId, major: r.major, term: r.term } }));
    if (removeBox?.checked) p.removed.forEach(s => ops.push({ path: `students/${s.id}`, data: null }));
    if (!ops.length) return;
    go.disabled = true; go.textContent = "Đang lưu…";
    try {
      await writeDocuments(ops);
      showErr(null);
      importPlan = null; $("importText").value = ""; $("importBox").open = false;
      renderImport();
    } catch (e) { showErr(e); go.disabled = false; go.textContent = "Thử lại"; }
  });
  const actions = el("div", "actions");
  actions.append(go);
  nodes.push(actions);
  box.replaceChildren(...nodes);
}

// ---------- Trạng thái + buổi học ----------

function onConfig() {
  const st = config?.status || "draft";
  document.querySelectorAll('#statusSeg input').forEach(r => { r.checked = r.value === st; });
  $("statusHint").textContent = STATUS_HINT[st] || "";
  ctx.setBadge?.("lich", { draft: "Chưa mở", open: "Đang mở", closed: "Đã đóng", published: "Công bố" }[st]);
  if (!sessDraft || !sessDirty()) { sessDraft = null; renderSessions(); }
  if (!classEdited) classDraft = null; // buổi học đổi: dựng lại lớp theo buổi mới
  renderClasses(false);
  renderArrange();
}

function sessBase() {
  if (sessDraft) return sessDraft;
  const from = config?.from || DEFAULT_RANGE.from, to = config?.to || DEFAULT_RANGE.to;
  const have = new Set(config ? sessions() : weekdaySessions(from, to));
  sessDraft = { from, to, off: new Set(weekdaySessions(from, to).filter(id => !have.has(id))) };
  return sessDraft;
}
const draftSessions = () => { const d = sessBase(); return weekdaySessions(d.from, d.to).filter(id => !d.off.has(id)); };
const sessDirty = () => !config || draftSessions().join() !== sessions().join() || sessDraft.from !== config.from || sessDraft.to !== config.to;

function renderSessions() {
  const d = sessBase();
  $("dFrom").value = d.from;
  $("dTo").value = d.to;
  const all = weekdaySessions(d.from, d.to);
  const on = new Set(all.filter(id => !d.off.has(id)));
  $("sessGrid").replaceChildren(all.length
    ? sessionGrid({ ids: all, selected: on, onChange: sel => { d.off = new Set(all.filter(id => !sel.has(id))); sessHint(); } })
    : el("p", "muted", "Khoảng ngày không có ngày thứ 2–6 nào."));
  sessHint();
}

function sessHint() {
  const ids = draftSessions();
  const days = new Set(ids.map(id => parseSession(id).date)).size;
  const dirty = sessDirty();
  $("sessHint").textContent = `${ids.length} buổi trong ${days} ngày` + (dirty ? " · chưa lưu" : " · đã lưu");
  $("sessSave").disabled = !dirty || !ids.length;
}

function onRange() {
  const d = sessBase();
  const from = $("dFrom").value, to = $("dTo").value;
  if (!from || !to || from > to) { $("sessHint").textContent = "Ngày bắt đầu phải trước ngày kết thúc."; $("sessSave").disabled = true; return; }
  d.from = from; d.to = to;
  renderSessions();
}

async function saveSessions() {
  const d = sessBase();
  const ids = draftSessions();
  const used = classes.some(c => c.sessionIds.some(id => !ids.includes(id)));
  $("sessSave").disabled = true;
  try {
    await saveDocument("schedule/config", { status: config?.status || "draft", from: d.from, to: d.to, sessions: ids });
    sessDraft = null;
    showErr(null);
    if (used) $("schErr").textContent = "Đã lưu. Một số lớp có buổi vừa bị bỏ; các buổi đó không còn tính khi xếp lớp.";
  } catch (e) { showErr(e); sessHint(); }
}

async function changeStatus(status) {
  const prev = config?.status || "draft";
  const reject = msg => { $("schErr").textContent = msg; onConfig(); };
  if (!config || !sessions().length) return reject("Lưu buổi học trước khi đổi trạng thái.");
  if (status === "published") {
    if (!classes.length) return reject("Lưu lớp trước khi công bố.");
    if (arrDraft) return reject("Kết quả xếp lớp chưa lưu. Lưu ở mục Xếp lớp trước khi công bố.");
  }
  try {
    await saveDocument("schedule/config", { status, from: config.from, to: config.to, sessions: sessions() });
    showErr(null);
  } catch (e) { showErr(e); config = { ...config, status: prev }; onConfig(); }
}

// ---------- Lớp ----------

// capacity: sĩ số tối đa; "" (lưu là null) = không giới hạn, sĩ số theo lịch sinh viên đăng ký
const toDraft = list => list.map(c => ({ id: c.id, name: c.name || "", capacity: c.capacity || "", zalo: c.zalo || "", sessionIds: new Set(validIds(c.sessionIds)) }));
const fromDraft = list => list.map(c => ({ id: c.id, name: c.name.trim(), capacity: Number(c.capacity) || null, zalo: c.zalo.trim(), sessionIds: validIds([...c.sessionIds]).sort() }));
const classesDirty = () => JSON.stringify(fromDraft(classDraft || [])) !== JSON.stringify(fromDraft(toDraft(classes)));

function defaultClasses() {
  return [
    { id: "c1", name: "Lớp 1 (sáng)", capacity: "", zalo: "", sessionIds: new Set(sessions().filter(id => parseSession(id).shift === "am")) },
    { id: "c2", name: "Lớp 2 (chiều)", capacity: "", zalo: "", sessionIds: new Set(sessions().filter(id => parseSession(id).shift === "pm")) }
  ];
}

function onClasses() {
  if (!classEdited || !classesDirty()) { classDraft = null; classEdited = false; }
  renderClasses(true);
  renderStudents();
  renderArrange();
}

// rebuild = false: chỉ dựng lại khi chưa có bản nháp (tránh mất con trỏ đang gõ khi dữ liệu khác cập nhật)
function renderClasses(rebuild) {
  if (!["students", "config", "classes"].every(k => loaded.has(k))) return;
  const list = $("classList");
  if (!sessions().length) {
    classDraft = null;
    list.replaceChildren(el("p", "muted", "Lưu buổi học trước, rồi chọn buổi cho từng lớp."));
    $("classHint").textContent = ""; $("classSave").disabled = true; $("classAdd").disabled = true;
    return;
  }
  $("classAdd").disabled = false;
  if (classDraft && !rebuild) { classHint(); return; }
  if (!classDraft) classDraft = classes.length ? toDraft(classes) : defaultClasses();
  list.replaceChildren(...classDraft.map((c, i) => {
    const card = el("div", "cls");
    const head = el("div", "cls-head");
    const field = (label, input) => { const l = el("label", "fld"); l.append(el("span", null, label), input); return l; };
    const name = el("input"); name.value = c.name; name.maxLength = 60;
    name.addEventListener("input", () => { c.name = name.value; edited(); });
    const cap = el("input"); cap.type = "number"; cap.min = "1"; cap.max = "500"; cap.value = c.capacity; cap.inputMode = "numeric";
    cap.placeholder = "Không giới hạn";
    cap.addEventListener("input", () => { c.capacity = cap.value; edited(); });
    const del = el("button", "btn btn-ghost btn-sm", "Xoá lớp"); del.type = "button";
    del.addEventListener("click", () => { classDraft.splice(i, 1); classEdited = true; renderClasses(true); });
    head.append(field("Tên lớp", name), field("Sĩ số tối đa (để trống nếu không giới hạn)", cap), del);
    const zalo = el("input"); zalo.type = "url"; zalo.placeholder = "https://zalo.me/g/…"; zalo.value = c.zalo;
    zalo.addEventListener("input", () => { c.zalo = zalo.value; edited(); });
    const count = el("p", "muted cls-count");
    const setCount = () => { count.textContent = `${validIds([...c.sessionIds]).length} buổi`; };
    const quick = el("div", "cls-quick");
    [["am", "Tất cả buổi sáng"], ["pm", "Tất cả buổi chiều"], ["", "Bỏ hết"]].forEach(([shift, label]) => {
      const b = el("button", "btn btn-ghost btn-sm", label); b.type = "button";
      b.addEventListener("click", () => { c.sessionIds = new Set(shift ? sessions().filter(id => parseSession(id).shift === shift) : []); classEdited = true; renderClasses(true); });
      quick.append(b);
    });
    setCount();
    quick.append(count);
    card.append(head, field("Link nhóm Zalo (sinh viên thấy khi công bố)", zalo), quick,
      sessionGrid({ ids: sessions(), selected: c.sessionIds, onChange: () => { setCount(); edited(); } }));
    return card;
  }));
  classHint();
}

function edited() { classEdited = true; classHint(); }

function classProblem() {
  if (!classDraft.length) return "Cần ít nhất một lớp.";
  for (const c of classDraft) {
    const label = c.name.trim() || "Lớp chưa đặt tên";
    if (!c.name.trim()) return "Lớp nào cũng cần tên.";
    const cap = Number(c.capacity);
    if (String(c.capacity).trim() && (!Number.isInteger(cap) || cap < 1)) return `${label}: sĩ số phải là số nguyên từ 1, hoặc để trống.`;
    if (c.zalo.trim() && !safeUrl(c.zalo)) return `${label}: link Zalo phải bắt đầu bằng https://`;
    if (!validIds([...c.sessionIds]).length) return `${label}: chọn ít nhất một buổi.`;
  }
  return "";
}

function classHint() {
  if (!classDraft) return;
  const problem = classProblem(), dirty = classesDirty() || !classes.length;
  $("classHint").textContent = problem || `${classDraft.length} lớp · ${students.length} sinh viên` + (dirty ? " · chưa lưu" : " · đã lưu");
  $("classHint").classList.toggle("warn", !!problem);
  $("classSave").disabled = !!problem || !dirty;
}

async function saveClasses() {
  if (classProblem()) return;
  $("classSave").disabled = true;
  try {
    await saveDocument("schedule/classes", { classes: fromDraft(classDraft) });
    classDraft = null; classEdited = false;
    showErr(null);
  } catch (e) { showErr(e); classHint(); }
}

function addClass() {
  const n = classDraft.reduce((m, c) => Math.max(m, Number(c.id.slice(1)) || 0), 0) + 1;
  classDraft.push({ id: "c" + n, name: `Lớp ${n}`, capacity: "", zalo: "", sessionIds: new Set() });
  classEdited = true;
  renderClasses(true);
}

// ---------- Tổng hợp + xếp lớp ----------

const savedClasses = () => classes.map(c => ({ ...c, sessionIds: validIds(c.sessionIds) }));
const currentAssign = () => arrDraft || new Map(students.map(s => [s.id, assigns.get(s.id) || ""]));

function renderArrange() {
  if (!["students", "config", "classes", "avail", "assigns"].every(k => loaded.has(k))) return;
  const ids = sessions();
  const reporters = students.filter(s => avail.has(s.id));
  const counts = new Map();
  reporters.forEach(s => validIds(avail.get(s.id)).forEach(id => counts.set(id, (counts.get(id) || 0) + 1)));
  $("sumHint").textContent = `${reporters.length} / ${students.length} sinh viên đã báo lịch. Số trên mỗi ô là số người rảnh buổi đó.`;
  $("sumGrid").replaceChildren(ids.length ? sessionGrid({ ids, counts, total: reporters.length }) : el("p", "muted", "Chưa có buổi học."));

  const cls = savedClasses();
  const at = currentAssign();
  const head = el("tr");
  ["#", "Họ tên", "MSSV", "Báo lịch", ...cls.map(c => `Khớp ${c.name}`), "Lớp"].forEach(h => head.append(el("th", null, h)));
  $("arrHead").replaceChildren(head);
  // Dữ liệu mới về khi đang mở dropdown trong bảng: đóng nó trước khi dựng lại các dòng
  if ($("arrRows").contains(document.activeElement)) document.activeElement.blur();
  $("arrRows").replaceChildren(...students.map((s, i) => {
    const tr = el("tr");
    const mine = avail.has(s.id) ? validIds(avail.get(s.id)) : null;
    tr.append(el("td", "mono", String(i + 1)), el("td", null, s.name || s.email), el("td", "mono", s.studentId || "—"),
      el("td", mine ? "" : "miss", mine ? `${mine.length} buổi` : "Chưa báo"));
    const fitCells = cls.map(c => {
      const td = el("td", "mono", mine ? `${fitCount(mine, c)}/${c.sessionIds.length}` : "—");
      td.classList.toggle("hit", at.get(s.id) === c.id);
      tr.append(td);
      return td;
    });
    const pick = createDropdown({
      label: `Lớp của ${s.name || s.email}`,
      options: [{ value: "", label: "Chưa xếp" }, ...cls.map(c => ({ value: c.id, label: c.name }))],
      value: cls.some(c => c.id === at.get(s.id)) ? at.get(s.id) : "",
      size: "sm",
      // Chỉ cập nhật dòng này và phần tổng, không dựng lại cả bảng (giữ focus trên dropdown)
      onChange: v => {
        arrDraft = new Map(currentAssign());
        arrDraft.set(s.id, v);
        fitCells.forEach((td, k) => td.classList.toggle("hit", cls[k].id === v));
        renderArrangeMeta();
      }
    });
    const td = el("td"); td.append(pick); tr.append(td);
    return tr;
  }));
  $("arrEmpty").hidden = students.length > 0;
  renderArrangeMeta();
}

// Số người mỗi lớp, gợi ý và trạng thái các nút của phần xếp lớp
function renderArrangeMeta() {
  const cls = savedClasses();
  const at = currentAssign();
  const reporters = students.filter(s => avail.has(s.id)).length;
  const per = new Map(cls.map(c => [c.id, 0]));
  let none = 0;
  students.forEach(s => { const id = at.get(s.id); if (per.has(id)) per.set(id, per.get(id) + 1); else none++; });
  ctx.setBadge?.("xep-lop", cls.length && none ? `${none} chưa xếp` : "");
  $("arrChips").replaceChildren(...cls.map(c => {
    const n = per.get(c.id), over = c.capacity > 0 && n > c.capacity;
    const chip = el("span", over ? "chip chip-warn" : "chip", c.capacity > 0 ? `${c.name}: ${n}/${c.capacity}` : `${c.name}: ${n}`);
    return chip;
  }), el("span", "chip chip-muted", `Chưa xếp: ${none}`));
  const st = config?.status || "draft";
  $("arrHint").textContent = !cls.length ? "Tạo và lưu lớp ở mục Lịch & lớp trước."
    : arrDraft ? "Có thay đổi chưa lưu. Sinh viên chỉ thấy kết quả đã lưu, khi trạng thái là Công bố lớp."
    : st === "open" ? "Đăng ký lịch đang mở. Nên đóng đăng ký trước khi xếp để lịch rảnh không đổi nữa."
    : "Chạy xếp tự động, chỉnh tay ở cột Lớp nếu cần, rồi lưu.";
  $("arrRun").disabled = !cls.length || !reporters;
  $("arrSave").disabled = !arrDraft;
  $("arrCsv").disabled = !students.length;
}

function runArrange() {
  const res = arrange(students.map(s => ({ email: s.id, sessionIds: avail.has(s.id) ? validIds(avail.get(s.id)) : [] })), savedClasses());
  arrDraft = new Map(students.map(s => [s.id, res.get(s.id) || ""]));
  renderArrange();
}

async function saveArrange() {
  if (!arrDraft) return;
  const listed = new Set(students.map(s => s.id));
  const ops = [];
  arrDraft.forEach((classId, email) => {
    if (classId && assigns.get(email) !== classId) ops.push({ path: `assignments/${email}`, data: { classId } });
    if (!classId && assigns.has(email)) ops.push({ path: `assignments/${email}`, data: null });
  });
  assigns.forEach((_, email) => { if (!listed.has(email)) ops.push({ path: `assignments/${email}`, data: null }); });
  $("arrSave").disabled = true;
  try {
    await writeDocuments(ops);
    arrDraft = null;
    showErr(null);
    renderArrange();
  } catch (e) { showErr(e); $("arrSave").disabled = false; }
}

function exportArrange() {
  const cls = savedClasses(), at = currentAssign();
  const head = ["STT", "Họ tên", "Email", "MSSV", "Lớp", "Số buổi rảnh", ...cls.map(c => `Khớp ${c.name}`)];
  downloadCsv("xep-lop-ai-thuc-chien", head, students.map((s, i) => {
    const mine = avail.has(s.id) ? validIds(avail.get(s.id)) : null;
    return [i + 1, s.name, s.email, s.studentId || "", cls.find(c => c.id === at.get(s.id))?.name || "", mine ? mine.length : "",
      ...cls.map(c => (mine ? `${fitCount(mine, c)}/${c.sessionIds.length}` : ""))];
  }));
}

// ---------- Sự kiện ----------

$("stuQ").addEventListener("input", renderStudents);
$("stuCsv").addEventListener("click", exportStudents);
$("importCheck").addEventListener("click", () => { importPlan = planImport($("importText").value); renderImport(); });
$("importText").addEventListener("input", () => { if (importPlan) { importPlan = null; renderImport(); } });
$("statusSeg").addEventListener("change", e => changeStatus(e.target.value));
$("dFrom").addEventListener("change", onRange);
$("dTo").addEventListener("change", onRange);
$("sessSave").addEventListener("click", saveSessions);
$("classAdd").addEventListener("click", addClass);
$("classSave").addEventListener("click", saveClasses);
$("arrRun").addEventListener("click", runArrange);
$("arrSave").addEventListener("click", saveArrange);
$("arrCsv").addEventListener("click", exportArrange);
window.addEventListener("beforeunload", e => {
  if (arrDraft || (classEdited && classesDirty()) || (sessDraft && config && sessDirty())) e.preventDefault();
});
