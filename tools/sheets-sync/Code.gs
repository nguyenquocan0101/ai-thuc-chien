/**
 * Đồng bộ đăng ký từ Firestore (collection `registrations`) sang Google Sheet.
 *
 * Dán file này vào Extensions → Apps Script của chính file Sheet (xem README, mục "Đồng bộ sang Google Sheet").
 * - Chỉ THÊM dòng cho email chưa có trong tab; không xoá, không sửa dòng đã có (kể cả dòng nhập tay).
 * - Tìm cột theo tiêu đề ở dòng 1: cột có chữ "email" là bắt buộc; các cột tên, ngành, kỳ, MSSV, thời gian nếu có thì được điền.
 * - Đọc Firestore bằng quyền IAM của tài khoản Google đang chạy script (cần là Owner/Editor của project Firebase),
 *   nên không phụ thuộc firestore.rules và không cần khoá bí mật nào.
 */
const PROJECT_ID = "ai-thuc-chien-fa26";
const SHEET_GID = 1176171014; // tab nhận dữ liệu (số sau "gid=" trên URL)
const SYNC_EVERY_MINUTES = 15; // mỗi lần đồng bộ đọc toàn bộ collection: 15 phút giữ số lượt đọc trong hạn mức miễn phí

const MAJORS = { SE: "Kỹ thuật phần mềm", AI: "Trí tuệ nhân tạo", IA: "An toàn thông tin", IS: "Hệ thống thông tin", OTHER: "Ngành khác" };

// Nhận diện cột theo tiêu đề (không phân biệt hoa thường, bỏ dấu tiếng Việt). Thứ tự quan trọng: email trước tên, thời gian trước kỳ ("Thời gian đăng ký" có chữ "ký").
const COLUMNS = [
  ["email", /email|e-mail|mail/],
  ["studentId", /mssv|ma so|student id/],
  ["createdAt", /thoi gian|ngay|date|time|timestamp/],
  ["major", /nganh|major/],
  ["term", /\bky\b|hoc ky|term|semester/],
  ["name", /ten|name/],
];

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Firebase")
    .addItem("Đồng bộ ngay", "syncNow")
    .addItem(`Bật tự đồng bộ (${SYNC_EVERY_MINUTES} phút)`, "installTrigger")
    .addItem("Tắt tự đồng bộ", "removeTrigger")
    .addToUi();
}

function syncNow() {
  const added = syncRegistrations();
  SpreadsheetApp.getActive().toast(added ? `Đã thêm ${added} đăng ký mới.` : "Không có đăng ký mới.", "Firebase", 5);
}

function installTrigger() {
  removeTrigger();
  ScriptApp.newTrigger("syncRegistrations").timeBased().everyMinutes(SYNC_EVERY_MINUTES).create();
  SpreadsheetApp.getActive().toast(`Sheet sẽ tự đồng bộ mỗi ${SYNC_EVERY_MINUTES} phút.`, "Firebase", 5);
}

function removeTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === "syncRegistrations")
    .forEach(t => ScriptApp.deleteTrigger(t));
}

/** Thêm các đăng ký có email chưa xuất hiện trong tab. Trả về số dòng đã thêm. */
function syncRegistrations() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) return 0; // lần chạy trước chưa xong
  try {
    const sheet = SpreadsheetApp.getActive().getSheets().find(s => s.getSheetId() === SHEET_GID);
    if (!sheet) throw new Error(`Không thấy tab có gid=${SHEET_GID}. Sửa SHEET_GID ở đầu script.`);

    const lastCol = Math.max(sheet.getLastColumn(), 1);
    const headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const col = mapColumns(headers);
    if (col.email === undefined) throw new Error('Dòng 1 của tab cần có một cột tiêu đề chứa chữ "Email".');

    const lastRow = sheet.getLastRow();
    const known = new Set(lastRow > 1
      ? sheet.getRange(2, col.email + 1, lastRow - 1, 1).getDisplayValues().map(r => normEmail(r[0])).filter(Boolean)
      : []);

    const fresh = fetchRegistrations()
      .filter(r => r.email && !known.has(normEmail(r.email)))
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    if (!fresh.length) return 0;

    const rows = fresh.map(r => {
      const row = new Array(lastCol).fill("");
      if (col.email !== undefined) row[col.email] = r.email;
      if (col.name !== undefined) row[col.name] = r.name || "";
      if (col.major !== undefined) row[col.major] = MAJORS[r.major] || r.major || "";
      if (col.term !== undefined) row[col.term] = r.term ? Number(r.term) : "";
      if (col.studentId !== undefined) row[col.studentId] = r.studentId || "";
      if (col.createdAt !== undefined) row[col.createdAt] = r.createdAt || "";
      return row;
    });
    const start = lastRow + 1;
    sheet.getRange(start, 1, rows.length, lastCol).setValues(rows);
    if (col.createdAt !== undefined) sheet.getRange(start, col.createdAt + 1, rows.length, 1).setNumberFormat("dd/MM/yyyy HH:mm");
    return rows.length;
  } finally {
    lock.releaseLock();
  }
}

function mapColumns(headers) {
  const col = {};
  headers.forEach((h, i) => {
    const key = fold(h);
    if (!key) return;
    const hit = COLUMNS.find(([name, re]) => col[name] === undefined && re.test(key));
    if (hit) col[hit[0]] = i;
  });
  return col;
}

/** Đọc toàn bộ collection `registrations` qua Firestore REST, có phân trang. */
function fetchRegistrations() {
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/registrations`;
  const headers = { Authorization: "Bearer " + ScriptApp.getOAuthToken(), "x-goog-user-project": PROJECT_ID };
  const out = [];
  let pageToken = "";
  do {
    const url = `${base}?pageSize=300${pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : ""}`;
    const res = UrlFetchApp.fetch(url, { headers, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) {
      throw new Error(`Firestore trả về ${res.getResponseCode()}: ${res.getContentText().slice(0, 300)}`);
    }
    const body = JSON.parse(res.getContentText());
    (body.documents || []).forEach(d => out.push(readDoc(d.fields || {})));
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return out;
}

function readDoc(f) {
  const v = k => {
    const x = f[k];
    if (!x) return "";
    if ("stringValue" in x) return x.stringValue;
    if ("integerValue" in x) return x.integerValue;
    if ("booleanValue" in x) return x.booleanValue;
    if ("timestampValue" in x) return new Date(x.timestampValue);
    return "";
  };
  return { email: v("email"), name: v("name"), major: v("major"), term: v("term"), studentId: v("studentId"), createdAt: v("createdAt") };
}

const normEmail = s => String(s || "").trim().toLowerCase();
const fold = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();
