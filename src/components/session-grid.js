import { SHIFTS, parseSession, dayLabel, byWeek, sessionId } from "../lib/schedule.js";

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/**
 * Lưới buổi học: mỗi tuần một khối, mỗi ngày một dòng có ô Sáng và Chiều. Dùng chung cho trang sinh viên và admin.
 * - ids: các buổi có trong lịch; ngày có trong lịch nhưng thiếu ca thì ô đó hiện "Nghỉ".
 * - selected: Set id đang chọn; khi bấm, lưới sửa trực tiếp Set này rồi gọi onChange(selected).
 * - readOnly: chỉ hiển thị. counts (Map id → số) + total: hiện số người rảnh mỗi buổi, đậm dần theo tỷ lệ.
 */
export function sessionGrid({ ids, selected = new Set(), onChange, readOnly = false, counts = null, total = 0 }) {
  const have = new Set(ids);
  const dates = [...new Set(ids.map(id => parseSession(id).date))];
  const root = el("div", "sg");
  for (const week of byWeek(dates)) {
    const box = el("div", "sg-week");
    box.append(el("p", "sg-week-h", "Tuần " + week.label));
    for (const date of week.dates) {
      const row = el("div", "sg-day");
      row.append(el("span", "sg-date", dayLabel(date)));
      for (const [shift, info] of Object.entries(SHIFTS)) {
        const id = sessionId(date, shift);
        if (!have.has(id)) { row.append(el("span", "sg-slot is-off", "Nghỉ")); continue; }
        const interactive = !readOnly && !counts;
        const slot = el(interactive ? "button" : "span", "sg-slot");
        slot.append(el("b", null, info.name), el("small", null, info.time));
        if (counts) {
          const n = counts.get(id) || 0, heat = total ? n / total : 0;
          slot.classList.add("is-count");
          if (heat >= 0.55) slot.classList.add("is-hot");
          slot.style.setProperty("--heat", `${Math.round(heat * 100)}%`);
          slot.append(el("span", "sg-n", `${n} người`));
        } else if (interactive) {
          slot.type = "button";
          slot.setAttribute("aria-label", `${dayLabel(date)}, buổi ${info.name.toLowerCase()} ${info.time}`);
          slot.setAttribute("aria-pressed", String(selected.has(id)));
          slot.addEventListener("click", () => {
            if (selected.has(id)) selected.delete(id); else selected.add(id);
            slot.setAttribute("aria-pressed", String(selected.has(id)));
            onChange?.(selected);
          });
        } else if (selected.has(id)) {
          slot.classList.add("is-on");
        }
        row.append(slot);
      }
      box.append(row);
    }
    root.append(box);
  }
  return root;
}
