/**
 * Xếp sinh viên vào lớp. Mỗi lớp học một bộ buổi cố định; sinh viên vào lớp trùng nhiều buổi rảnh nhất,
 * nên sĩ số mỗi lớp đi theo lịch sinh viên đăng ký (các lớp có thể lệch nhau).
 * - Độ khớp = số buổi của lớp mà sinh viên rảnh / số buổi của lớp.
 * - Ai khớp hai lớp như nhau thì vào lớp đang ít người hơn.
 * - capacity là sĩ số tối đa; để trống (null, 0) là không giới hạn. Lớp đủ người thì sinh viên sang lớp khớp kế tiếp:
 *   người kén lớp (chênh lệch giữa lớp hợp nhất và lớp kế tiếp lớn) được xếp trước, sau đó đổi chỗ từng cặp
 *   nếu tổng độ khớp tăng.
 * - Sinh viên chưa báo lịch, không trùng buổi nào, hoặc dư khi mọi lớp hợp đã đủ người thì để trống cho admin xếp tay.
 *
 * students: [{ email, sessionIds }], classes: [{ id, sessionIds, capacity }] → Map(email → classId)
 */
export function fitCount(sessionIds, cls) {
  const set = new Set(cls.sessionIds);
  return sessionIds.filter(id => set.has(id)).length;
}

export function arrange(students, classes) {
  if (!classes.length) return new Map();
  const pool = students.filter(s => s.sessionIds.length);
  const limit = classes.map(c => (c.capacity > 0 ? c.capacity : Infinity));
  const rows = pool.map(s => {
    const sc = classes.map(c => (c.sessionIds.length ? fitCount(s.sessionIds, c) / c.sessionIds.length : 0));
    const [first = 0, second = 0] = [...sc].sort((a, b) => b - a);
    return { email: s.email, sc, regret: first - second };
  });
  rows.sort((a, b) => b.regret - a.regret || a.email.localeCompare(b.email));

  const count = classes.map(() => 0);
  const at = new Map();
  for (const r of rows) {
    const best = classes.map((_, i) => i)
      .filter(i => r.sc[i] > 0 && count[i] < limit[i])
      .sort((i, j) => r.sc[j] - r.sc[i] || count[i] - count[j])[0];
    if (best !== undefined) { at.set(r, best); count[best]++; }
  }

  // Cải thiện: chuyển sang lớp còn chỗ, hoặc đổi chỗ với người ở lớp kia, khi tổng độ khớp tăng
  const EPS = 1e-9;
  for (let pass = 0, changed = true; changed && pass < 50; pass++) {
    changed = false;
    for (const [a, i] of at) {
      for (let j = 0; j < classes.length; j++) {
        if (j === i || a.sc[j] <= a.sc[i] + EPS) continue;
        if (count[j] < limit[j]) { at.set(a, j); count[i]--; count[j]++; changed = true; break; }
        const b = [...at].find(([o, k]) => k === j && o.sc[i] > 0 && a.sc[j] + o.sc[i] > a.sc[i] + o.sc[j] + EPS);
        if (b) { at.set(a, j); at.set(b[0], i); changed = true; break; }
      }
    }
  }
  return new Map([...at].map(([r, i]) => [r.email, classes[i].id]));
}
