export function distanceMeters(a, b) {
  const rad = value => value * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const lat1 = rad(a.latitude), lat2 = rad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function attendanceQrPayload(sessionId, token) {
  return `ai-attendance:${sessionId}:${token}`;
}

export function parseAttendanceQr(value) {
  const match = /^ai-attendance:([a-zA-Z0-9_-]{8,80}):([a-zA-Z0-9_-]{16,100})$/.exec(String(value || "").trim());
  return match ? { sessionId: match[1], token: match[2] } : null;
}

export function formatAttendanceTime(timestamp) {
  const date = timestamp?.toDate?.();
  return date ? date.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" }) : "—";
}
