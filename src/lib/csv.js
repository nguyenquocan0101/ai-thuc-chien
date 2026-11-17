// Xuất CSV mở được bằng Excel/Google Sheets: có BOM để giữ tiếng Việt, chặn ô bị hiểu thành công thức.
// Spreadsheet apps execute cells starting with = + - @ as formulas
const csvCell = v => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };

export function downloadCsv(name, head, rows) {
  const csv = "\uFEFF" + [head, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
