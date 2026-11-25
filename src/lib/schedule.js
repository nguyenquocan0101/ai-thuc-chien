// MSSV: 2 chữ cái và 6 chữ số, ví dụ SE123456 (firestore.rules kiểm tra cùng định dạng)
export const SID_RE = /^[A-Z]{2}[0-9]{6}$/;
export const cleanSid = v => String(v || "").replace(/\s+/g, "").toUpperCase();
