// Phần lớp học trên trang admin: danh sách sinh viên (nhập từ Sheet, sửa, xoá, xếp lớp, lọc theo lớp) và tổng quan hai lớp.
// Lớp và lịch từng lớp cố định trong course.js (CLASSES); lớp của sinh viên là students/{email}.classId, chỉ admin ghi.
// availability/{email} (ca sáng/chiều của cách chia cũ) chỉ còn được xoá kèm khi xoá sinh viên.
import { watchCollection, writeDocuments } from "../lib/firebase.js";
import { SID_RE, cleanSid } from "../lib/schedule.js";
import { confirmDialog, wireDialog } from "../components/dialog.js";
import { downloadCsv } from "../lib/csv.js";
import { downloadXlsx } from "../lib/xlsx.js";
import { CLASSES } from "./course.js";

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const fold = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
const EMAIL_RE = /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/;
// Kỳ 8, 9: khi số người của kỳ đó lẻ, người dư vào Modern AI
const LEAN_MODERN_TERMS = new Set([8, 9]);

let ctx;                 // { majors, registrations: () => [], setBadge, select }
let students = [];       // students/*
const picked = new Set(); // email các sinh viên đang được tick
let avail = new Set();   // email có availability (cách chia cũ), để xoá kèm
let classTab = "";       // tab lọc theo lớp trên mục Sinh viên: "" = tất cả, id lớp, hoặc "none" = chưa xếp
let importPlan = null;

// Lớp của sinh viên theo classId; undefined = chưa xếp lớp
const classOf = s => CLASSES[s.classId];
const classKey = s => (CLASSES[s.classId] ? s.classId : "none");
const classCounts = () => {
  const n = { none: 0 };
  Object.keys(CLASSES).forEach(id => { n[id] = 0; });
  students.forEach(s => { n[classKey(s)]++; });
  return n;
};
const termNum = s => Number(s.term) || 0;
const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""), "vi") || a.id.localeCompare(b.id);

function showErr(e) {
  if (e) console.error(e);
  $("schErr").textContent = e
    ? (e.code === "permission-denied" ? "Firestore từ chối thao tác. Kiểm tra rules đã deploy và email này là admin." : "Lỗi: " + (e.code || e.message))
    : "";
}

export function startSchedule(context) {
  ctx = context;
  const stops = [
    watchCollection("students", rows => { students = rows.sort(byName); renderStudents(); renderClassPanel(); }, showErr),
    watchCollection("availability", rows => { avail = new Set(rows.map(r => r.id)); }, showErr)
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
  return students.filter(s => (!classTab || classKey(s) === classTab) && (!term || (s.term || "none") === term) && (!q || fold([s.name, s.email, s.studentId].join(" ")).includes(q)));
}

// Tab lọc theo lớp: Tất cả, từng lớp, Chưa xếp lớp, kèm sĩ số
function renderClassTabs() {
  const n = classCounts();
  const tabs = [["", "Tất cả", students.length], ...Object.entries(CLASSES).map(([id, c]) => [id, c.short, n[id]]), ["none", "Chưa xếp lớp", n.none]];
  $("stuClassTabs").replaceChildren(...tabs.map(([id, label, count]) => {
    const b = el("button", "seg-btn" + (id === "none" && count ? " is-warn" : ""));
    b.type = "button"; b.dataset.tab = id;
    b.setAttribute("aria-pressed", String(classTab === id));
    b.append(el("span", null, label), el("span", "seg-n", String(count)));
    return b;
  }));
}

function renderBulk(list) {
  const n = picked.size;
  $("stuBulk").hidden = n === 0;
  $("stuBulkCount").textContent = `Đã chọn ${n} sinh viên`;
  $("stuBulkDel").textContent = `Xoá ${n} sinh viên`;
  document.querySelectorAll("#stuBulk [data-move]").forEach(b => { b.textContent = `Chuyển sang ${CLASSES[b.dataset.move].short}`; });
  const shown = list.filter(s => picked.has(s.id)).length;
  $("stuAll").checked = list.length > 0 && shown === list.length;
  $("stuAll").indeterminate = shown > 0 && shown < list.length;
  $("stuAll").disabled = list.length === 0;
}

function renderStudents() {
  renderTermFilter();
  renderClassTabs();
  [...picked].forEach(id => { if (!students.some(s => s.id === id)) picked.delete(id); });
  const list = visibleStudents();
  $("stuRows").replaceChildren(...list.map((s, i) => {
    const tr = el("tr");
    const check = el("input");
    check.type = "checkbox"; check.dataset.id = s.id; check.checked = picked.has(s.id);
    check.setAttribute("aria-label", `Chọn ${s.name || s.email}`);
    const checkCell = el("td", "cell-check");
    checkCell.append(check);
    tr.append(checkCell);
    tr.classList.toggle("is-picked", check.checked);
    const cells = [
      [String(i + 1), "mono"], [s.name], [s.email], [s.studentId || "Thiếu", s.studentId ? "mono" : "mono miss"],
      [s.term ? "Kỳ " + s.term : "—", "mono"], [classOf(s)?.short || "Chưa xếp lớp", classOf(s) ? "" : "miss"]
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
  ctx.setBadge?.("lop", String(Object.keys(CLASSES).length));
  const withSid = students.filter(s => s.studentId).length;
  const n = classCounts();
  $("stuSummary").textContent = students.length
    ? `${students.length} sinh viên · ${withSid} có MSSV · ${Object.entries(CLASSES).map(([id, c]) => `${n[id]} ${c.short}`).join(" · ")} · ${n.none} chưa xếp lớp`
    : "Chưa có sinh viên nào. Nhập danh sách từ Google Sheet bên dưới.";
  renderBulk(list);
  $("stuEmpty").hidden = list.length > 0;
  $("stuEmpty").textContent = students.length ? (classTab && !$("stuQ").value && !$("stuTerm").value ? "Lớp này chưa có sinh viên." : "Không có kết quả phù hợp.") : "Chưa có sinh viên. Bấm Nhập từ Google Sheet.";
}

const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const dayCol = iso => { const [y, m, d] = iso.split("-").map(Number); return `${DOW[new Date(y, m - 1, d).getDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`; };

// File Excel tổng: trang đầu là toàn bộ sinh viên, sau đó mỗi lớp một trang, rồi mỗi buổi của từng lớp một trang
// (danh sách sinh viên của lớp đó, có cột trống để điểm danh). Lớp và buổi lấy từ CLASSES, sinh viên theo classId.
function exportWorkbook() {
  const n = classCounts();
  const major = code => ctx.majors[code] || code || "";
  const order = Object.keys(CLASSES);
  const rank = s => (CLASSES[s.classId] ? order.indexOf(s.classId) : order.length); // ai chưa có lớp xếp cuối
  const sorted = [...students].sort((a, b) => rank(a) - rank(b) || byName(a, b));
  const fmtDay = iso => `${dayCol(iso)}/${iso.slice(0, 4)}`;
  const span = list => list.length ? `${fmtDay(list[0].date)} – ${fmtDay(list[list.length - 1].date)}` : "";
  const allSessions = Object.values(CLASSES).flatMap(c => c.sessions).sort((a, b) => a.date.localeCompare(b.date));

  const total = {
    name: "Tổng sinh viên",
    head: 3 + order.length,
    rows: [
      ["Tổng số sinh viên", students.length],
      ...order.map(id => [CLASSES[id].name, n[id]]),
      ["Chưa xếp lớp", n.none],
      ["Thời gian học", span(allSessions)],
      [],
      ["STT", "Họ tên", "Email", "MSSV", "Ngành", "Kỳ", "Lớp"],
      ...sorted.map((s, i) => [i + 1, s.name || "", s.email || s.id, s.studentId || "", major(s.major), s.term ? Number(s.term) : "",
        classOf(s)?.name || "Chưa xếp lớp"])
    ]
  };

  const sheets = [total];
  for (const [id, c] of Object.entries(CLASSES)) {
    const list = students.filter(s => s.classId === id).sort(byName);
    sheets.push({
      name: c.short,
      head: 5,
      rows: [
        ["Lớp", c.name],
        ["Thời gian", span(c.sessions)],
        ["Số buổi", c.sessions.length],
        ["Sĩ số", list.length],
        [],
        ["STT", "Họ tên", "MSSV", "Email", "Ngành", "Kỳ"],
        ...list.map((s, i) => [i + 1, s.name || "", s.studentId || "", s.email || s.id, major(s.major), s.term ? Number(s.term) : ""])
      ]
    });
    // Hai lớp học cùng giờ nên tên trang buổi học có tên lớp ở đầu
    c.sessions.forEach((x, i) => sheets.push({
      name: `${c.short} B${i + 1} ${dayCol(x.date).replace("/", "-")}`,
      head: 6,
      rows: [
        ["Lớp", c.name],
        ["Buổi", `Buổi ${i + 1}: ${x.topic}`],
        ["Thời gian", `${fmtDay(x.date)} · ${x.from} – ${x.to}`],
        ["Địa điểm", x.room],
        ["Sĩ số", list.length],
        [],
        ["STT", "Họ tên", "MSSV", "Email", "Có mặt", "Ghi chú"],
        ...list.map((s, k) => [k + 1, s.name || "", s.studentId || "", s.email || s.id, "", ""])
      ]
    }));
  }

  // Tên trang tính phải khác nhau và tối đa 31 ký tự: thêm số nếu trùng
  const seen = new Map();
  downloadXlsx("ai-thuc-chien-fa26", sheets.map(sh => {
    const base = sh.name.slice(0, 28), k = (seen.get(base) || 0) + 1;
    seen.set(base, k);
    return { ...sh, name: k > 1 ? `${base} ${k}` : base };
  }));
}

function exportStudents() {
  const head = ["STT", "Họ tên", "Email", "MSSV", "Ngành", "Kỳ", "Lớp"];
  downloadCsv("sinh-vien-lich-hoc", head, students.map((s, i) => [
    i + 1, s.name, s.email, s.studentId || "", ctx.majors[s.major] || s.major || "", s.term || "", classOf(s)?.name || ""
  ]));
}

// Chia lớp tự động, đều sĩ số và đều từng kỳ: gom sinh viên theo kỳ (cao xuống thấp, chưa rõ kỳ cuối), trong mỗi kỳ xếp theo tên
// rồi chia xen kẽ hai lớp. Kỳ 8, 9 bắt đầu từ Modern AI (kỳ lẻ người thì Modern AI hơn 1); các kỳ khác bắt đầu từ lớp đang ít
// người hơn (bằng nhau thì Modern AI) để tổng hai lớp cân lại. Xếp lại toàn bộ, ghi đè lớp đã xếp tay.
function planSplit() {
  const groups = new Map();
  [...students].sort((a, b) => (termNum(b) || -1) - (termNum(a) || -1) || byName(a, b))
    .forEach(s => { const t = termNum(s); groups.set(t, [...(groups.get(t) || []), s]); });
  const n = { modern: 0, harness: 0 }, plan = [];
  for (const [term, list] of groups) {
    const first = LEAN_MODERN_TERMS.has(term) || n.modern <= n.harness ? "modern" : "harness";
    const second = first === "modern" ? "harness" : "modern";
    list.forEach((s, i) => { const id = i % 2 ? second : first; n[id]++; plan.push({ s, classId: id, term }); });
  }
  return plan;
}

async function splitClasses() {
  if (!students.length) return;
  const plan = planSplit();
  const count = id => plan.filter(p => p.classId === id).length;
  // "Kỳ 9: 3 Modern AI, 2 Harness" cho từng kỳ
  const terms = [...new Set(plan.map(p => p.term))];
  const byTerm = terms.map(t => {
    const of = id => plan.filter(p => p.term === t && p.classId === id).length;
    return `${t ? "Kỳ " + t : "Chưa rõ kỳ"}: ${of("modern")} ${CLASSES.modern.short}, ${of("harness")} ${CLASSES.harness.short}`;
  }).join("; ");
  const changed = plan.filter(p => p.s.classId !== p.classId);
  const manual = students.filter(s => CLASSES[s.classId]).length;
  const ok = await confirmDialog({
    title: "Chia lớp tự động?",
    message: `${CLASSES.modern.name}: ${count("modern")} sinh viên. ${CLASSES.harness.name}: ${count("harness")} sinh viên. `
      + `Mỗi kỳ chia đều hai lớp, kỳ 8 và 9 nghiêng về Modern AI. ${byTerm}. ${changed.length} sinh viên sẽ đổi lớp`
      + (manual ? `; lớp đã xếp trước đó của ${manual} sinh viên bị ghi đè.` : ".")
      + " Sau đó vẫn chuyển từng người được bằng nút Sửa hoặc tick rồi Chuyển sang.",
    confirmLabel: changed.length ? `Xếp lớp cho ${changed.length} sinh viên` : "Đồng ý"
  });
  if (!ok || !changed.length) return;
  $("stuSplit").disabled = true;
  try {
    await writeDocuments(changed.map(p => ({ path: `students/${p.s.id}`, data: { classId: p.classId } })));
    showErr(null);
  } catch (e) { showErr(e); } finally { $("stuSplit").disabled = false; }
}

// Chuyển các sinh viên đang tick sang một lớp
async function movePicked(classId) {
  const list = students.filter(s => picked.has(s.id) && s.classId !== classId);
  if (!list.length) { picked.clear(); renderStudents(); return; }
  const btns = document.querySelectorAll("#stuBulk [data-move]");
  btns.forEach(b => { b.disabled = true; });
  try {
    await writeDocuments(list.map(s => ({ path: `students/${s.id}`, data: { classId } })));
    picked.clear();
    showErr(null);
  } catch (e) { showErr(e); } finally {
    btns.forEach(b => { b.disabled = false; });
    renderStudents();
  }
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
  $("stuClass").value = CLASSES[s?.classId] ? s.classId : "";
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
    classId: $("stuClass").value
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
  const ops = [{ path: `students/${v.email}`, data: { name: v.name, email: v.email, studentId: v.studentId, major: v.major, term: v.term, classId: v.classId } }];
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
    message: `${s.name || s.email} (${s.email}) sẽ bị xoá khỏi danh sách, không đăng nhập trang lịch học được nữa.`,
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
    message: `${names} sẽ bị xoá khỏi danh sách, không đăng nhập trang lịch học được nữa. Không hoàn tác được.`,
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

// ---------- Lớp ----------

// Mỗi lớp một thẻ: tên, sĩ số theo kỳ, lịch 6 buổi và nút xem danh sách lớp ở mục Sinh viên
function renderClassPanel() {
  const n = classCounts();
  $("classMeta").textContent = `${Object.keys(CLASSES).length} lớp học song song · ${students.length} sinh viên · ${n.none} chưa xếp lớp`;
  $("classCards").replaceChildren(...Object.entries(CLASSES).map(([id, c]) => {
    const list = students.filter(s => s.classId === id);
    const byTerm = new Map();
    list.forEach(s => { const t = termNum(s); byTerm.set(t, (byTerm.get(t) || 0) + 1); });
    const terms = [...byTerm].sort((a, b) => (b[0] || -1) - (a[0] || -1)).map(([t, k]) => `${t ? "Kỳ " + t : "Chưa rõ kỳ"}: ${k}`).join(" · ");
    const card = el("section", "card panel cls-card");
    const head = el("div", "head");
    const title = el("div");
    title.append(el("h2", null, c.name), el("p", "muted", `${list.length} sinh viên${terms ? " · " + terms : ""}`));
    const view = el("button", "btn btn-ghost btn-sm", "Xem danh sách lớp");
    view.type = "button";
    view.addEventListener("click", () => { classTab = id; renderStudents(); ctx.select?.("sinh-vien"); });
    head.append(title, view);
    const table = el("table", "sess-table");
    const thead = el("thead"), tr = el("tr");
    ["Buổi", "Ngày", "Giờ", "Chủ đề", "Địa điểm"].forEach(h => tr.append(el("th", null, h)));
    thead.append(tr);
    const body = el("tbody");
    c.sessions.forEach((x, i) => {
      const row = el("tr");
      [[String(i + 1), "mono"], [`${dayCol(x.date)}/${x.date.slice(0, 4)}`, "mono"], [`${x.from} – ${x.to}`, "mono"], [x.topic], [x.room]]
        .forEach(([v, cls]) => row.append(el("td", cls || "", v)));
      body.append(row);
    });
    table.append(thead, body);
    const wrap = el("div", "table-wrap");
    wrap.append(table);
    card.append(head, wrap);
    return card;
  }));
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
$("stuSplit").addEventListener("click", splitClasses);
Object.entries(CLASSES).forEach(([id, c]) => $("stuClass").append(new Option(c.name, id)));
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
$("stuClassTabs").addEventListener("click", e => {
  const b = e.target.closest("button[data-tab]");
  if (!b) return;
  classTab = b.dataset.tab;
  renderStudents();
});
$("stuBulk").addEventListener("click", e => { const b = e.target.closest("[data-move]"); if (b) movePicked(b.dataset.move); });
