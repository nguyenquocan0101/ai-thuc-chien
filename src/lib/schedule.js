// Lịch học: các ngày thứ 2–6, mỗi ngày 2 buổi. Id buổi dạng "2026-11-23-am", ngày theo giờ địa phương.

export const SHIFTS = {
  am: { name: "Sáng", time: "7:30 – 11:30" },
  pm: { name: "Chiều", time: "13:00 – 17:00" }
};

export const STATUS = {
  draft: "Chưa mở",
  open: "Đang mở đăng ký",
  closed: "Đã đóng, đang xếp lớp",
  published: "Đã công bố lớp"
};

export const SID_RE = /^[A-Z]{2}[0-9]{6}$/;
export const cleanSid = v => String(v || "").replace(/\s+/g, "").toUpperCase();

const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const pad = n => String(n).padStart(2, "0");
const toDate = iso => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const toIso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const short = iso => { const d = toDate(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };

export const sessionId = (date, shift) => `${date}-${shift}`;
export const parseSession = id => ({ date: id.slice(0, 10), shift: id.slice(11) });
export const dayLabel = iso => `${DOW[toDate(iso).getDay()]} ${short(iso)}`;

export function sessionLabel(id) {
  const { date, shift } = parseSession(id);
  const s = SHIFTS[shift];
  return s ? `${dayLabel(date)} · ${s.name} ${s.time}` : id;
}

// Mọi buổi thứ 2–6 trong khoảng ngày (tính cả hai đầu)
export function weekdaySessions(from, to) {
  if (!from || !to) return [];
  const out = [];
  for (const d = toDate(from), end = toDate(to); d <= end && out.length < 400; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) Object.keys(SHIFTS).forEach(shift => out.push(sessionId(toIso(d), shift)));
  }
  return out;
}

// Gom các ngày theo tuần (thứ 2 đầu tuần)
export function byWeek(dates) {
  const weeks = new Map();
  for (const iso of [...dates].sort()) {
    const d = toDate(iso);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = toIso(d);
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key).push(iso);
  }
  return [...weeks.values()].map(ds => ({ dates: ds, label: `${short(ds[0])} – ${short(ds[ds.length - 1])}` }));
}

// Link Zalo do admin nhập được hiện cho sinh viên: chỉ nhận https để không chèn được javascript:
export function safeUrl(url) {
  try { const u = new URL(String(url || "").trim()); return u.protocol === "https:" ? u.href : ""; }
  catch { return ""; }
}
