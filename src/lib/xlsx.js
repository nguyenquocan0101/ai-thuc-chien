// Ghi file Excel (.xlsx) nhiều trang tính, không cần thư viện ngoài.
// Ô chữ ghi dạng inlineStr nên Excel không bao giờ hiểu nội dung thành công thức.
// sheets: [{ name, title?, info?: [[nhãn, giá trị], ...], columns: [{ label, width?, center? }], rows: [[ô, ...], ...] }]
// Bố cục mỗi trang: dòng tiêu đề lớn, các dòng thông tin "Nhãn: giá trị" (gộp ô hết bề ngang bảng), một dòng trống,
// rồi bảng có viền với dòng tiêu đề tô màu và cố định khi cuộn. Độ rộng cột chỉ tính theo bảng, chữ quá dài thì xuống dòng.

const enc = new TextEncoder();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))
  // ký tự điều khiển không hợp lệ trong XML
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
const colName = i => { let s = ""; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
// Tên trang tính: tối đa 31 ký tự, không chứa : \ / ? * [ ]
const sheetName = s => String(s).replace(/[:\\/?*[\]]/g, " ").slice(0, 31) || "Sheet";
const isNum = v => typeof v === "number" && Number.isFinite(v);

// Kiểu ô (thứ tự khớp cellXfs trong styles.xml)
const ST = { title: 1, info: 2, head: 3, cell: 4, center: 5, headCenter: 6 };
const MAX_W = 48;

// Độ rộng cột theo tiêu đề và dữ liệu của bảng; cột có width cố định thì dùng luôn
function widths(columns, rows) {
  return columns.map((col, c) => {
    if (col.width) return col.width;
    const len = Math.max(String(col.label).length, ...rows.map(r => (r[c] === "" || r[c] == null ? 0 : String(r[c]).length)));
    return Math.min(Math.max(Math.ceil(len * 1.1) + 3, 7), MAX_W);
  });
}

const textCell = (ref, style, v) => `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
// "Nhãn: giá trị" với nhãn in đậm (rich text trong một ô)
const infoCell = (ref, label, v) => `<c r="${ref}" s="${ST.info}" t="inlineStr"><is><r><rPr><b/><sz val="11"/><rFont val="Calibri"/></rPr><t xml:space="preserve">${esc(label)}: </t></r><r><rPr><sz val="11"/><rFont val="Calibri"/></rPr><t xml:space="preserve">${esc(v)}</t></r></is></c>`;

function sheetXml({ title, info = [], columns, rows }) {
  const n = Math.max(columns.length, 1), last = colName(n - 1);
  const out = [], merges = [];
  let r = 0;
  const line = (cells, ht) => { r++; out.push(`<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ""}>${cells}</row>`); };
  const spanAll = () => { if (n > 1) merges.push(`A${r}:${last}${r}`); };
  if (title) { line(textCell(`A${r + 1}`, ST.title, title), 24); spanAll(); }
  info.forEach(([label, v]) => { line(infoCell(`A${r + 1}`, label, v ?? "")); spanAll(); });
  if (title || info.length) line("");
  const headRow = r + 1;
  line(columns.map((col, c) => textCell(`${colName(c)}${r + 1}`, col.center ? ST.headCenter : ST.head, col.label)).join(""), 22);
  rows.forEach(row => {
    line(columns.map((col, c) => {
      const v = row[c], ref = `${colName(c)}${r + 1}`, style = col.center ? ST.center : ST.cell;
      if (v === "" || v == null) return `<c r="${ref}" s="${style}"/>`; // ô trống vẫn có viền (cột điểm danh)
      return isNum(v) ? `<c r="${ref}" s="${style}"><v>${v}</v></c>` : textCell(ref, style, v);
    }).join(""));
  });
  const cols = `<cols>${widths(columns, rows).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`;
  const pane = `<pane ySplit="${headRow}" topLeftCell="A${headRow + 1}" activePane="bottomLeft" state="frozen"/>`;
  const merge = merges.length ? `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/>${cols}<sheetData>${out.join("")}</sheetData>${merge}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

// Kiểu ô: 1 tiêu đề trang, 2 dòng thông tin, 3 tiêu đề bảng (đậm, tô màu, viền), 4 ô bảng (viền, xuống dòng), 5 ô bảng căn giữa,
// 6 tiêu đề bảng căn giữa (cột center)
const BORDER = '<border><left style="thin"><color rgb="FFE3D5C8"/></left><right style="thin"><color rgb="FFE3D5C8"/></right><top style="thin"><color rgb="FFE3D5C8"/></top><bottom style="thin"><color rgb="FFE3D5C8"/></bottom><diagonal/></border>';
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
  + `<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="15"/><color rgb="FFC4510D"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF17141F"/><name val="Calibri"/></font><font><sz val="11"/><color rgb="FF17141F"/><name val="Calibri"/></font></fonts>`
  + `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFDE7D6"/></patternFill></fill></fills>`
  + `<borders count="2"><border/>${BORDER}</borders><cellStyleXfs count="1"><xf/></cellStyleXfs>`
  + `<cellXfs count="7"><xf/>`
  + `<xf fontId="1" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>`
  + `<xf fontId="3" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>`
  + `<xf fontId="2" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>`
  + `<xf fontId="3" borderId="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>`
  + `<xf fontId="3" borderId="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`
  + `<xf fontId="2" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`
  + `</cellXfs></styleSheet>`;

function files(sheets) {
  const n = sheets.length;
  const list = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(sheetName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", STYLES],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)])
  ];
  return list.map(([name, text]) => ({ name: enc.encode(name), data: enc.encode(text) }));
}

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = bytes => { let c = 0xFFFFFFFF; for (const b of bytes) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

// Gói ZIP không nén (store): đủ cho file vài trăm KB, Excel mở bình thường
function zip(entries) {
  const parts = [], central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, 0, 2], [12, 0x21, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, name.length, 2], [28, 0, 2]]
      .forEach(([at, v, size]) => size === 4 ? local.setUint32(at, v, true) : local.setUint16(at, v, true));
    const head = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, 0, 2], [14, 0x21, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]
      .forEach(([at, v, size]) => size === 4 ? head.setUint32(at, v, true) : head.setUint16(at, v, true));
    parts.push(new Uint8Array(local.buffer), name, data);
    central.push(new Uint8Array(head.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, entries.length, 2], [10, entries.length, 2], [12, size, 4], [16, offset, 4], [20, 0, 2]]
    .forEach(([at, v, s]) => s === 4 ? end.setUint32(at, v, true) : end.setUint16(at, v, true));
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export const workbookBlob = sheets => zip(files(sheets));

export function downloadXlsx(name, sheets) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(workbookBlob(sheets));
  a.download = `${name}.xlsx`; // tên file do nơi gọi đặt (có thể có dấu, khoảng trắng)
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
