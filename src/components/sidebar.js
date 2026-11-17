/**
 * Sidebar điều hướng giữa các khu (panel) trong cùng một trang.
 * - Máy tính: cột dọc bên trái, dính khi cuộn. Điện thoại: thanh ngang cuộn được dưới header.
 * - Nhớ mục đang mở trên URL (#id) để tải lại trang vẫn ở đúng chỗ.
 *
 * const nav = createSidebar({
 *   label: "Mục quản trị",
 *   items: [{ id: "dang-ky", label: "Đăng ký", panel: "pDangKy", icon: "<path d=…/>" }, …],
 *   onChange: id => …
 * });
 * container.append(nav.el);
 * nav.setBadge("dang-ky", "115");   // số nhỏ bên phải mục; "" để ẩn
 * nav.select("lich");
 */
const SVG_NS = "http://www.w3.org/2000/svg";

export function createSidebar({ items, label = "Điều hướng", onChange }) {
  const el = document.createElement("nav");
  el.className = "sb";
  el.setAttribute("aria-label", label);
  const list = document.createElement("ul");
  list.className = "sb-list";
  const links = new Map(), badges = new Map();

  for (const item of items) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.className = "sb-item";
    a.href = "#" + item.id;
    a.setAttribute("aria-controls", item.panel);
    if (item.icon) {
      const svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("aria-hidden", "true");
      svg.classList.add("sb-ico");
      svg.innerHTML = item.icon; // icon là chuỗi SVG cố định trong code, không lấy từ dữ liệu người dùng
      a.append(svg);
    }
    const text = document.createElement("span");
    text.className = "sb-label";
    text.textContent = item.label;
    const badge = document.createElement("span");
    badge.className = "sb-badge";
    badge.hidden = true;
    a.append(text, badge);
    a.addEventListener("click", e => { e.preventDefault(); select(item.id); });
    li.append(a);
    list.append(li);
    links.set(item.id, a);
    badges.set(item.id, badge);
  }
  el.append(list);

  let current = null;
  function select(id, { silent = false } = {}) {
    const item = items.find(i => i.id === id) || items[0];
    current = item.id;
    for (const i of items) {
      const on = i.id === item.id;
      const a = links.get(i.id);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      const panel = document.getElementById(i.panel);
      if (panel) panel.hidden = !on;
    }
    reveal(links.get(item.id));
    history.replaceState(null, "", item === items[0] ? location.pathname + location.search : "#" + item.id);
    if (!silent) onChange?.(item.id);
  }

  // Thanh ngang trên điện thoại: cuộn để mục đang chọn nằm giữa (chờ một khung hình vì lúc đầu nav chưa gắn vào trang)
  function reveal(a) {
    requestAnimationFrame(() => {
      if (list.scrollWidth <= list.clientWidth) return;
      list.scrollLeft += a.getBoundingClientRect().left - list.getBoundingClientRect().left - (list.clientWidth - a.offsetWidth) / 2;
    });
  }

  function setBadge(id, text) {
    const b = badges.get(id);
    if (!b) return;
    b.textContent = text ?? "";
    b.hidden = !text && text !== 0;
  }

  // Menu có thể đang ẩn (chờ đăng nhập) khi chọn mục đầu tiên: khi nó hiện ra hoặc đổi cỡ thì cuộn lại
  new ResizeObserver(() => current && reveal(links.get(current))).observe(list);
  addEventListener("hashchange", () => { const id = location.hash.slice(1); if (id && id !== current) select(id); });
  select(location.hash.slice(1), { silent: true });
  return { el, select, setBadge, get current() { return current; } };
}
