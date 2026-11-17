// Phần đăng ký lịch học trên trang admin: danh sách sinh viên, buổi học (kèm trạng thái đăng ký lịch) và lớp.
// Dữ liệu: students/{email}, schedule/config, schedule/classes, availability/{email}.
// Mỗi sinh viên chọn một ca (sáng hoặc chiều) cho cả đợt, mỗi ca có đúng một lớp: lớp của sinh viên là lớp của ca đã chọn.
import { watchCollection, watchDocument, saveDocument, writeDocuments } from "../lib/firebase.js";
import { STATUS, SHIFTS, SID_RE, cleanSid, parseSession, weekdaySessions, shiftOf, safeUrl } from "../lib/schedule.js";
import { sessionGrid } from "../components/session-grid.js";
import { createDropdown } from "../components/dropdown.js";
import { confirmDialog, wireDialog } from "../components/dialog.js";
import { downloadCsv } from "../lib/csv.js";
import { downloadXlsx } from "../lib/xlsx.js";

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const fold = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
const EMAIL_RE = /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/;
const DEFAULT_RANGE = { from: "2026-11-23", to: "2026-12-04" }; // tuần 12–13

let ctx;                 // { majors, registrations: () => [] }
let students = [];       // students/*
const picked = new Set(); // email các sinh viên đang được tick để xoá nhiều
let config = null;       // schedule/config (null = chưa có)
let classes = [];        // schedule/classes.classes đã lưu
let avail = new Map();   // email → sessionIds
let availAt = new Map(); // email → lúc sinh viên lưu ca (Timestamp)
let loaded = new Set();  // các nguồn đã tải xong lần đầu
let sessDraft = null;    // { from, to, off: Set } đang sửa
let classDraft = null;   // [{ id, name, shift, zalo }] đang sửa; buổi của lớp = mọi buổi của ca đó
let classEdited = false; // admin đã sửa bản nháp lớp (khi đó dữ liệu mới không ghi đè lên)
let importPlan = null;

const sessions = () => config?.sessions || [];
const validIds = ids => { const have = new Set(sessions()); return (ids || []).filter(id => have.has(id)); };
const ofShift = shift => sessions().filter(id => parseSession(id).shift === shift);
const shiftName = shift => (SHIFTS[shift] ? `Ca ${SHIFTS[shift].name.toLowerCase()}` : "");
const classShift = c => shiftOf(validIds(c.sessionIds));
// Ca sinh viên đã chọn ("" = chưa chọn) và lớp tương ứng
const shiftOfStudent = email => (avail.has(email) ? shiftOf(validIds(avail.get(email))) : "");
const classOfStudent = email => { const sh = shiftOfStudent(email); return sh ? classes.find(c => classShift(c) === sh) : undefined; };
const shiftCounts = () => {
  const n = { am: 0, pm: 0, none: 0 };
  students.forEach(s => { const sh = shiftOfStudent(s.id); n[sh in n ? sh : "none"]++; });
  return n;
};
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
    watchCollection("students", rows => { students = rows.sort(byName); done("students"); renderStudents(); renderClasses(false); }, showErr),
    watchDocument("schedule/config", c => { config = c; done("config"); onConfig(); }, showErr),
    watchDocument("schedule/classes", c => { classes = c?.classes || []; done("classes"); onClasses(); }, showErr),
    watchCollection("availability", rows => { avail = new Map(rows.map(r => [r.id, r.sessionIds || []])); availAt = new Map(rows.map(r => [r.id, r.updatedAt])); done("avail"); renderStudents(); classStats(); }, showErr)
  ];
  return () => stops.forEach(stop => stop());
}

// ---------- Sinh viên ----------

// Lựa chọn kỳ lấy từ dữ liệu: "Kỳ 3 (12)"; sinh viên chưa có kỳ gom vào "Chưa rõ kỳ"
function renderTermFilter() {
  const sel = $("stuTerm");
  const count = new Map();
  students.forEach(s => { const t = s.term || "none"; count.set(t, (count.get(t) || 0) + 1); });
  const terms = [...count.keys()].filter(t => t !== "none").sort((a, b) => a - b);
  if (count.has("none")) terms.push("none");
  const opts = [["", "Tất cả kỳ"], ...terms.map(t => [t, `${t === "none" ? "Chưa rõ kỳ" : "Kỳ " + t} (${count.get(t)})`])];
  if (opts.map(o => o.join()).join("|") === [...sel.options].map(o => [o.value, o.text].join()).join("|")) return;
  const keep = sel.value;
  sel.replaceChildren(...opts.map(([v, label]) => new Option(label, v)));
  sel.value = opts.some(([v]) => v === keep) ? keep : "";
}

function visibleStudents() {
  const q = fold($("stuQ").value), term = $("stuTerm").value;
  return students.filter(s => (!term || (s.term || "none") === term) && (!q || fold([s.name, s.email, s.studentId].join(" ")).includes(q)));
}

function renderBulk(list) {
  const n = picked.size;
  $("stuBulk").hidden = n === 0;
  $("stuBulkCount").textContent = `Đã chọn ${n} sinh viên`;
  $("stuBulkDel").textContent = `Xoá ${n} sinh viên`;
  const shown = list.filter(s => picked.has(s.id)).length;
  $("stuAll").checked = list.length > 0 && shown === list.length;
  $("stuAll").indeterminate = shown > 0 && shown < list.length;
  $("stuAll").disabled = list.length === 0;
}

function renderStudents() {
  renderTermFilter();
  [...picked].forEach(id => { if (!students.some(s => s.id === id)) picked.delete(id); });
  const list = visibleStudents();
  $("stuRows").replaceChildren(...list.map((s, i) => {
    const tr = el("tr");
    const sh = shiftOfStudent(s.id);
    const check = el("input");
    check.type = "checkbox"; check.dataset.id = s.id; check.checked = picked.has(s.id);
    check.setAttribute("aria-label", `Chọn ${s.name || s.email}`);
    const checkCell = el("td", "cell-check");
    checkCell.append(check);
    tr.append(checkCell);
    tr.classList.toggle("is-picked", check.checked);
    const cells = [
      [String(i + 1), "mono"], [s.name], [s.email], [s.studentId || "Thiếu", s.studentId ? "mono" : "mono miss"],
      [s.term ? "Kỳ " + s.term : "—", "mono"], [SHIFTS[sh]?.name || "Chưa chọn", sh ? "" : "miss"], [classOfStudent(s.id)?.name || "—"]
    ];
    cells.forEach(([v, cls]) => tr.append(el("td", cls || "", v || "—")));
    const act = el("td", "cell-act");
    [["edit", "Sửa"], ["del", "Xoá"]].forEach(([kind, label]) => {
      const b = el("button", `btn btn-link ${kind}`, label);
      b.type = "button"; b.dataset.act = kind; b.dataset.id = s.id;
      b.setAttribute("aria-label", `${label} ${s.name || s.email}`);
      act.append(b);
    });
    tr.append(act);
    return tr;
  }));
  ctx.setBadge?.("sinh-vien", students.length ? String(students.length) : "");
  if (loaded.has("config") && loaded.has("classes")) renderBadges();
  const withSid = students.filter(s => s.studentId).length;
  const n = shiftCounts();
  $("stuSummary").textContent = students.length
    ? `${students.length} sinh viên · ${withSid} có MSSV · ${n.am} sáng · ${n.pm} chiều · ${n.none} chưa chọn ca`
    : "Chưa có sinh viên nào. Nhập danh sách từ Google Sheet bên dưới.";
  renderBulk(list);
  $("stuEmpty").hidden = list.length > 0;
  $("stuEmpty").textContent = students.length ? "Không có kết quả phù hợp." : "Chưa có sinh viên. Bấm Nhập từ Google Sheet.";
}

// Giờ Việt Nam, dạng "17/11/2026 14:05"; rỗng nếu chưa có
const fmtTs = ts => {
  const d = ts?.toDate?.();
  return d ? d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "";
};
const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const dayCol = iso => { const [y, m, d] = iso.split("-").map(Number); return `${DOW[new Date(y, m - 1, d).getDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`; };

// Một file Excel gồm mọi dữ liệu trên Firestore mà trang quản trị đang xem, mỗi loại một trang tính
function exportWorkbook() {
  const ids = sessions();
  const days = [...new Set(ids.map(id => parseSession(id).date))].sort();
  const n = shiftCounts();
  const regs = ctx.registrations();
  const st = config?.status || "draft";
  const major = code => ctx.majors[code] || code || "";
  // Theo lớp rồi theo tên; ai chưa có lớp xếp cuối
  const clsName = s => classOfStudent(s.id)?.name || "";
  const sorted = [...students].sort((a, b) => (!clsName(a) - !clsName(b)) || clsName(a).localeCompare(clsName(b), "vi") || byName(a, b));

  const overview = [
    ["Mục", "Giá trị"],
    ["Trạng thái đăng ký lịch", STATUS[st] || st],
    ["Thời gian học", days.length ? `${dayCol(days[0])} – ${dayCol(days[days.length - 1])}/${days[days.length - 1].slice(0, 4)}` : ""],
    ["Số ngày học", days.length],
    ["Số buổi (tính cả hai ca)", ids.length],
    ["Số lớp", classes.length],
    ["Sinh viên trong danh sách", students.length],
    ["Có MSSV", students.filter(s => s.studentId).length],
    ["Chọn ca sáng", n.am],
    ["Chọn ca chiều", n.pm],
    ["Chưa chọn ca", n.none],
    ["Đơn đăng ký", regs.length],
    ["Xuất lúc", new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false })]
  ];

  const studentRows = [["STT", "Họ tên", "Email", "MSSV", "Ngành", "Kỳ", "Ca", "Giờ học", "Lớp", "Nhóm Zalo", "Số buổi", "Chọn ca lúc"],
    ...sorted.map((s, i) => {
      const sh = shiftOfStudent(s.id), cls = classOfStudent(s.id);
      return [i + 1, s.name || "", s.email || s.id, s.studentId || "", major(s.major), s.term ? Number(s.term) : "",
        SHIFTS[sh]?.name || "Chưa chọn", SHIFTS[sh]?.time || "", cls?.name || "", safeUrl(cls?.zalo) || "", sh ? ofShift(sh).length : "", fmtTs(availAt.get(s.id))];
    })];

  // Bảng điểm danh: mỗi sinh viên một dòng, mỗi ngày học một cột để đánh dấu có mặt
  const attendance = [["STT", "Họ tên", "MSSV", "Email", "Lớp", "Ca", ...days.map(dayCol), "Số buổi có mặt"],
    ...sorted.filter(s => shiftOfStudent(s.id)).map((s, i) => [i + 1, s.name || "", s.studentId || "", s.email || s.id,
      classOfStudent(s.id)?.name || "", SHIFTS[shiftOfStudent(s.id)]?.name || "", ...days.map(() => ""), ""])];

  const sessionRows = [["STT", "Ngày", "Thứ", "Ca", "Giờ", "Lớp", "Số sinh viên"],
    ...ids.map((id, i) => {
      const { date, shift } = parseSession(id);
      const cls = classes.find(c => classShift(c) === shift);
      return [i + 1, `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`, dayCol(date).split(" ")[0], SHIFTS[shift]?.name || shift, SHIFTS[shift]?.time || "", cls?.name || "", n[shift] ?? ""];
    })];

  const classRows = [["Lớp", "Ca", "Giờ học", "Số buổi", "Số sinh viên", "Nhóm Zalo"],
    ...classes.map(c => { const sh = classShift(c); return [c.name || "", SHIFTS[sh]?.name || "", SHIFTS[sh]?.time || "", sh ? ofShift(sh).length : 0, sh ? n[sh] : 0, safeUrl(c.zalo) || ""]; })];

  const regRows = [["STT", "Họ tên", "Email", "MSSV", "Ngành", "Kỳ", "Ngôn ngữ", "Đăng ký lúc", "Có trong danh sách lịch"],
    ...regs.map((r, i) => [i + 1, r.name || "", r.email || "", r.studentId || "", major(r.major), r.term ? Number(r.term) : "", r.lang || "", fmtTs(r.createdAt),
      students.some(s => s.id === String(r.email || "").toLowerCase()) ? "Có" : "Không"])];

  downloadXlsx("ai-thuc-chien-fa26", [
    { name: "Tổng quan", rows: overview, widths: [28, 34] },
    { name: "Sinh viên", rows: studentRows, widths: [6, 26, 32, 12, 22, 6, 10, 14, 14, 30, 9, 18] },
    { name: "Điểm danh", rows: attendance, widths: [6, 26, 12, 32, 14, 8, ...days.map(() => 10), 14] },
    { name: "Buổi học", rows: sessionRows, widths: [6, 12, 6, 8, 14, 14, 13] },
    { name: "Lớp", rows: classRows, widths: [16, 8, 14, 9, 13, 34] },
    { name: "Đơn đăng ký", rows: regRows, widths: [6, 26, 32, 12, 22, 6, 9, 18, 20] }
  ]);
}

function exportStudents() {
  const head = ["STT", "Họ tên", "Email", "MSSV", "Ngành", "Kỳ", "Ca", "Lớp"];
  downloadCsv("sinh-vien-lich-hoc", head, students.map((s, i) => [
    i + 1, s.name, s.email, s.studentId || "", ctx.majors[s.major] || s.major || "", s.term || "",
    SHIFTS[shiftOfStudent(s.id)]?.name || "", classOfStudent(s.id)?.name || ""
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
    label.append(removeBox, el("span", null, ` Xoá ${p.removed.length} sinh viên đang có nhưng không còn trong bản dán: ${p.removed.slice(0, 5).map(s => s.email).join(", ")}${p.removed.length > 5 ? " …" : ""}`));
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
      importPlan = null; $("importText").value = ""; $("importBox").close();
      renderImport();
    } catch (e) { showErr(e); go.disabled = false; go.textContent = "Thử lại"; }
  });
  const actions = el("div", "actions");
  actions.append(go);
  nodes.push(actions);
  box.replaceChildren(...nodes);
}

// ---------- Thêm / sửa / xoá sinh viên ----------

let editing = null; // email đang sửa; null = thêm mới

function openStudentForm(s) {
  editing = s ? s.id : null;
  const f = $("stuForm");
  f.reset();
  f.querySelectorAll("[aria-invalid]").forEach(i => i.removeAttribute("aria-invalid"));
  $("stuFormTitle").textContent = s ? "Sửa sinh viên" : "Thêm sinh viên";
  f.elements.email.value = s ? s.id : "";
  f.elements.email.readOnly = !!s; // email là khoá của bản ghi, muốn đổi thì xoá rồi thêm lại
  f.elements.name.value = s?.name || "";
  f.elements.studentId.value = s?.studentId || "";
  f.elements.term.value = s?.term || "";
  $("stuMajor").value = s?.major || "";
  $("stuShift").value = s ? shiftOfStudent(s.id) : "";
  $("stuFormErr").textContent = "";
  $("stuFormSave").disabled = false;
  $("stuDialog").showModal();
  (s ? f.elements.name : f.elements.email).focus();
}

function studentFormProblem(v) {
  if (!EMAIL_RE.test(v.email)) return ["email", "Email chưa đúng định dạng."];
  if (!editing && students.some(s => s.id === v.email)) return ["email", "Email này đã có trong danh sách."];
  if (!v.name) return ["name", "Nhập họ tên."];
  if (v.studentId && !SID_RE.test(v.studentId)) return ["studentId", "MSSV gồm 2 chữ cái và 6 chữ số, ví dụ SE123456."];
  const owner = v.studentId && students.find(s => s.studentId === v.studentId && s.id !== v.email);
  if (owner) return ["studentId", `MSSV này đang thuộc về ${owner.email}.`];
  if (v.term && !/^[1-9]$/.test(v.term)) return ["term", "Kỳ là số từ 1 đến 9."];
  if (v.shift && !ofShift(v.shift).length) return ["shift", "Chưa có buổi học nào của ca này. Lưu buổi học trước."];
  return null;
}

async function saveStudentForm(e) {
  e.preventDefault();
  const f = $("stuForm");
  const v = {
    email: f.elements.email.value.trim().toLowerCase(),
    name: f.elements.name.value.trim(),
    studentId: cleanSid(f.elements.studentId.value),
    term: f.elements.term.value.trim(),
    major: $("stuMajor").value,
    shift: $("stuShift").value
  };
  f.querySelectorAll("[aria-invalid]").forEach(i => i.removeAttribute("aria-invalid"));
  const problem = studentFormProblem(v);
  if (problem) {
    const [field, msg] = problem;
    $("stuFormErr").textContent = msg;
    const input = f.elements[field];
    if (input?.tagName === "INPUT") { input.setAttribute("aria-invalid", "true"); input.focus(); }
    return;
  }
  const ops = [{ path: `students/${v.email}`, data: { name: v.name, email: v.email, studentId: v.studentId, major: v.major, term: v.term } }];
  // Ca do admin đặt: ghi lịch của sinh viên thành mọi buổi của ca đó; "Chưa chọn" thì xoá
  if (v.shift !== shiftOfStudent(v.email)) {
    if (v.shift) ops.push({ path: `availability/${v.email}`, data: { sessionIds: ofShift(v.shift) } });
    else if (avail.has(v.email)) ops.push({ path: `availability/${v.email}`, data: null });
  }
  $("stuFormSave").disabled = true;
  try {
    await writeDocuments(ops);
    showErr(null);
    $("stuDialog").close();
  } catch (err) {
    $("stuFormErr").textContent = err.code === "permission-denied" ? "Firestore từ chối thao tác. Kiểm tra rules đã deploy." : "Lỗi: " + (err.code || err.message);
    $("stuFormSave").disabled = false;
  }
}

async function deleteStudent(s) {
  const ok = await confirmDialog({
    title: "Xoá sinh viên?",
    message: `${s.name || s.email} (${s.email}) sẽ bị xoá khỏi danh sách, không đăng nhập trang lịch học được nữa. Ca đã chọn cũng bị xoá.`,
    confirmLabel: "Xoá", danger: true
  });
  if (!ok) return;
  const ops = [{ path: `students/${s.id}`, data: null }];
  if (avail.has(s.id)) ops.push({ path: `availability/${s.id}`, data: null });
  try { await writeDocuments(ops); showErr(null); } catch (err) { showErr(err); }
}

async function deletePicked() {
  const list = students.filter(s => picked.has(s.id));
  if (!list.length) return;
  const names = list.slice(0, 5).map(s => s.name || s.email).join(", ") + (list.length > 5 ? ` và ${list.length - 5} người khác` : "");
  const ok = await confirmDialog({
    title: `Xoá ${list.length} sinh viên?`,
    message: `${names} sẽ bị xoá khỏi danh sách, không đăng nhập trang lịch học được nữa. Ca đã chọn cũng bị xoá. Không hoàn tác được.`,
    confirmLabel: `Xoá ${list.length} sinh viên`, danger: true
  });
  if (!ok) return;
  const ops = list.flatMap(s => [{ path: `students/${s.id}`, data: null }, ...(avail.has(s.id) ? [{ path: `availability/${s.id}`, data: null }] : [])]);
  $("stuBulkDel").disabled = true;
  try {
    await writeDocuments(ops);
    picked.clear();
    showErr(null);
  } catch (err) {
    showErr(err);
  } finally {
    $("stuBulkDel").disabled = false;
    renderStudents();
  }
}

// ---------- Trạng thái + buổi học ----------

function onConfig() {
  const st = config?.status || "draft";
  renderStatus(st);
  renderBadges();
  if (!sessDraft || !sessDirty()) { sessDraft = null; renderSessions(); }
  if (!classEdited) classDraft = null; // buổi học đổi: dựng lại lớp theo buổi mới
  renderClasses(false);
  renderStudents();
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
  $("sessSave").disabled = true;
  try {
    await saveDocument("schedule/config", { status: config?.status || "draft", from: d.from, to: d.to, sessions: ids });
    sessDraft = null;
    showErr(null);
  } catch (e) { showErr(e); sessHint(); }
}

// Trạng thái đăng ký lịch trên đầu trang Buổi học: dòng trạng thái và nút sang bước tiếp theo (kèm nút quay lại khi cần)
const STATUS_STEPS = {
  draft: [["open", "Mở đăng ký", true]],
  open: [["closed", "Đóng đăng ký", true]],
  closed: [["open", "Mở lại", false], ["published", "Công bố lớp", true]],
  published: [["closed", "Huỷ công bố", false]]
};
function renderStatus(st) {
  const pill = el("span", "status-pill", STATUS[st]);
  pill.dataset.s = st;
  const dd = iso => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "");
  const range = config?.from && config?.to ? ` · ${dd(config.from)} – ${dd(config.to)}/${config.to.slice(0, 4)}` : "";
  $("sessMeta").replaceChildren(pill, document.createTextNode(range));
  $("statusActions").replaceChildren(...STATUS_STEPS[st].map(([next, label, primary]) => {
    const b = el("button", primary ? "btn btn-primary" : "btn btn-ghost", label);
    b.type = "button";
    b.addEventListener("click", () => { b.disabled = true; changeStatus(next); });
    return b;
  }));
}

async function changeStatus(status) {
  const prev = config?.status || "draft";
  const reject = msg => { $("schErr").textContent = msg; onConfig(); };
  if (!config || !sessions().length) return reject("Lưu buổi học trước khi đổi trạng thái.");
  if (status === "published") {
    if (!classes.length) return reject("Lưu lớp trước khi công bố.");
    if (classDraft && classesDirty()) return reject("Lớp có thay đổi chưa lưu. Lưu ở mục Lớp trước khi công bố.");
    const n = shiftCounts();
    const missing = Object.keys(SHIFTS).find(sh => n[sh] && !classes.some(c => classShift(c) === sh));
    if (missing) return reject(`Có ${n[missing]} sinh viên chọn ${shiftName(missing).toLowerCase()} nhưng chưa có lớp cho ca này.`);
  }
  try {
    await saveDocument("schedule/config", { status, from: config.from, to: config.to, sessions: sessions() });
    showErr(null);
  } catch (e) { showErr(e); config = { ...config, status: prev }; onConfig(); }
}

// ---------- Lớp ----------

const toDraft = list => list.map(c => ({ id: c.id, name: c.name || "", shift: classShift(c), zalo: c.zalo || "" }));
const fromDraft = list => list.map(c => ({ id: c.id, name: c.name.trim(), zalo: c.zalo.trim(), sessionIds: ofShift(c.shift).sort() }));
const classesDirty = () => JSON.stringify(fromDraft(classDraft || [])) !== JSON.stringify(fromDraft(toDraft(classes)));

function defaultClasses() {
  return [
    { id: "c1", name: "Lớp sáng", shift: "am", zalo: "" },
    { id: "c2", name: "Lớp chiều", shift: "pm", zalo: "" }
  ];
}

// Dòng thông tin của cả khoá: thời gian, số buổi, số lớp, số sinh viên; kèm số trên sidebar
function renderBadges() {
  const ids = sessions();
  ctx.setBadge?.("buoi-hoc", ids.length ? String(ids.length) : "");
  ctx.setBadge?.("lop", classes.length ? String(classes.length) : "");
}

function onClasses() {
  renderBadges();
  if (!classEdited || !classesDirty()) { classDraft = null; classEdited = false; }
  renderClasses(true);
  renderStudents();
}

// Mỗi lớp một dòng trong bảng. rebuild = false: chỉ dựng lại khi chưa có bản nháp (tránh mất con trỏ đang gõ khi dữ liệu khác cập nhật)
function renderClasses(rebuild) {
  if (!["students", "config", "classes"].every(k => loaded.has(k))) return;
  const rows = $("classRows"), empty = $("classEmpty");
  if (!sessions().length) {
    classDraft = null;
    rows.replaceChildren();
    empty.textContent = "Lưu buổi học trước, rồi tạo lớp.";
    empty.hidden = false;
    $("classHint").textContent = ""; $("classSave").disabled = true; $("classAdd").disabled = true;
    return;
  }
  if (classDraft && !rebuild) { classHint(); return; }
  if (!classDraft) classDraft = classes.length ? toDraft(classes) : defaultClasses();
  if (rows.contains(document.activeElement)) document.activeElement.blur();
  rows.replaceChildren(...classDraft.map((c, i) => {
    const tr = el("tr");
    tr.dataset.id = c.id;
    const cell = (node, cls) => { const td = el("td", cls); td.append(node); tr.append(td); return td; };
    const input = (value, attrs, onInput) => {
      const inp = el("input", "cell-input");
      inp.size = 1; // bề rộng theo cột, không theo cỡ mặc định của input
      Object.assign(inp, attrs);
      inp.value = value;
      inp.addEventListener("input", () => { onInput(inp.value); edited(); });
      return inp;
    };
    cell(input(c.name, { maxLength: 60, ariaLabel: "Tên lớp" }, v => { c.name = v; }));
    cell(createDropdown({
      label: `Ca của ${c.name || "lớp"}`,
      options: Object.entries(SHIFTS).map(([value, sh]) => ({ value, label: sh.name })),
      value: c.shift, placeholder: "Chọn ca", size: "sm",
      onChange: v => { c.shift = v; edited(); }
    }));
    cell(el("span", null, ""), "mono st-sess");
    cell(el("span", null, ""), "mono st-pick");
    cell(input(c.zalo, { type: "url", placeholder: "https://zalo.me/g/…", ariaLabel: "Link nhóm Zalo" }, v => { c.zalo = v; }));
    const del = el("button", "btn btn-ghost btn-sm", "Xoá"); del.type = "button";
    del.setAttribute("aria-label", `Xoá ${c.name || "lớp"}`);
    del.addEventListener("click", () => { classDraft.splice(i, 1); classEdited = true; renderClasses(true); });
    cell(del, "cell-act");
    return tr;
  }));
  empty.textContent = "Chưa có lớp. Bấm Thêm lớp.";
  empty.hidden = classDraft.length > 0;
  classHint();
}

// Số liệu trên từng dòng lớp: số buổi của ca và số sinh viên đã chọn ca đó (cũng là sĩ số của lớp)
function classStats() {
  if (!classDraft) return;
  const n = shiftCounts();
  for (const c of classDraft) {
    const tr = $("classRows").querySelector(`tr[data-id="${c.id}"]`);
    if (!tr) continue;
    tr.querySelector(".st-sess").textContent = c.shift ? String(ofShift(c.shift).length) : "—";
    tr.querySelector(".st-pick").textContent = c.shift ? String(n[c.shift]) : "—";
  }
}

function edited() { classEdited = true; classHint(); }

function classProblem() {
  if (!classDraft.length) return "Cần ít nhất một lớp.";
  for (const c of classDraft) {
    const label = c.name.trim() || "Lớp chưa đặt tên";
    if (!c.name.trim()) return "Lớp nào cũng cần tên.";
    if (c.zalo.trim() && !safeUrl(c.zalo)) return `${label}: link Zalo phải bắt đầu bằng https://`;
    if (!c.shift) return `${label}: chọn ca học.`;
    if (!ofShift(c.shift).length) return `${label}: ca này chưa có buổi nào trong mục Buổi học.`;
  }
  const dup = Object.keys(SHIFTS).find(sh => classDraft.filter(c => c.shift === sh).length > 1);
  if (dup) return `Mỗi ca chỉ có một lớp: ${shiftName(dup).toLowerCase()} đang có nhiều lớp.`;
  return "";
}

function classHint() {
  if (!classDraft) return;
  classStats();
  const problem = classProblem(), dirty = classesDirty() || !classes.length;
  $("classHint").textContent = problem || `${classDraft.length} lớp · ${students.length} sinh viên` + (dirty ? " · chưa lưu" : " · đã lưu");
  $("classHint").classList.toggle("warn", !!problem);
  $("classSave").disabled = !!problem || !dirty;
  $("classAdd").disabled = classDraft.length >= Object.keys(SHIFTS).length;
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
  const free = Object.keys(SHIFTS).find(sh => !classDraft.some(c => c.shift === sh)) || "";
  classDraft.push({ id: "c" + n, name: free ? `Lớp ${SHIFTS[free].name.toLowerCase()}` : `Lớp ${n}`, shift: free, zalo: "" });
  classEdited = true;
  renderClasses(true);
}

// ---------- Sự kiện ----------

$("stuQ").addEventListener("input", renderStudents);
$("stuTerm").addEventListener("change", renderStudents);
$("stuRows").addEventListener("change", e => {
  const box = e.target.closest("input[type=checkbox][data-id]");
  if (!box) return;
  if (box.checked) picked.add(box.dataset.id); else picked.delete(box.dataset.id);
  box.closest("tr").classList.toggle("is-picked", box.checked);
  renderBulk(visibleStudents());
});
// Chọn tất cả: chỉ những sinh viên đang hiển thị theo tìm kiếm và bộ lọc kỳ
$("stuAll").addEventListener("change", e => {
  visibleStudents().forEach(s => { if (e.target.checked) picked.add(s.id); else picked.delete(s.id); });
  renderStudents();
});
$("stuBulkClear").addEventListener("click", () => { picked.clear(); renderStudents(); });
$("stuBulkDel").addEventListener("click", deletePicked);
$("stuCsv").addEventListener("click", exportStudents);
$("stuXlsx").addEventListener("click", exportWorkbook);
$("stuAdd").addEventListener("click", () => openStudentForm(null));
$("stuForm").addEventListener("submit", saveStudentForm);
$("stuForm").addEventListener("input", e => { e.target.removeAttribute("aria-invalid"); $("stuFormErr").textContent = ""; });
wireDialog($("stuDialog"));
$("stuRows").addEventListener("click", e => {
  const b = e.target.closest("button[data-act]");
  const s = b && students.find(x => x.id === b.dataset.id);
  if (!s) return;
  if (b.dataset.act === "edit") openStudentForm(s); else deleteStudent(s);
});
$("importOpen").addEventListener("click", () => { $("importBox").showModal(); $("importText").focus(); });
wireDialog($("importBox"));
$("importCheck").addEventListener("click", () => { importPlan = planImport($("importText").value); renderImport(); });
$("importText").addEventListener("input", () => { if (importPlan) { importPlan = null; renderImport(); } });
$("dFrom").addEventListener("change", onRange);
$("dTo").addEventListener("change", onRange);
$("sessSave").addEventListener("click", saveSessions);
$("classAdd").addEventListener("click", addClass);
$("classSave").addEventListener("click", saveClasses);
window.addEventListener("beforeunload", e => {
  if ((classEdited && classesDirty()) || (sessDraft && config && sessDirty())) e.preventDefault();
});
