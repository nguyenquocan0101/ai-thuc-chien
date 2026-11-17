/**
 * Đầu trang của một mục: breadcrumb, tiêu đề, dòng tóm tắt và các nút thao tác bên phải.
 * - meta, actions là phần tử có sẵn trên trang: được chuyển vào đầu trang nguyên vẹn (giữ id và listener).
 * - Mục cuối của crumbs là trang hiện tại (aria-current), các mục có href là link.
 *
 * const head = createPageHeader({
 *   crumbs: [{ label: "Quản trị", href: "/admin/" }, { label: "AI Thực Chiến FA26" }, { label: "Sinh viên" }],
 *   title: "Danh sách sinh viên",
 *   meta: document.getElementById("stuSummary"),
 *   actions: document.getElementById("stuTools")
 * });
 * panel.prepend(head);
 */
export function createPageHeader({ crumbs = [], title, meta, actions }) {
  const el = document.createElement("header");
  el.className = "ph";

  if (crumbs.length) {
    const nav = document.createElement("nav");
    nav.className = "ph-crumbs";
    nav.setAttribute("aria-label", "Breadcrumb");
    const ol = document.createElement("ol");
    crumbs.forEach((c, i) => {
      const li = document.createElement("li");
      const last = i === crumbs.length - 1;
      const node = document.createElement(c.href && !last ? "a" : "span");
      node.textContent = c.label;
      if (c.href && !last) node.href = c.href;
      if (last) node.setAttribute("aria-current", "page");
      li.append(node);
      ol.append(li);
    });
    nav.append(ol);
    el.append(nav);
  }

  const row = document.createElement("div");
  row.className = "ph-row";
  const text = document.createElement("div");
  text.className = "ph-text";
  const h1 = document.createElement("h1");
  h1.textContent = title;
  text.append(h1);
  if (meta) { meta.classList.add("ph-meta"); text.append(meta); }
  row.append(text);
  if (actions) { actions.classList.add("ph-actions"); row.append(actions); }
  el.append(row);
  return el;
}
