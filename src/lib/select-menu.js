// Custom dropdown for <select> (WAI-ARIA "select-only combobox").
// The native <select> stays in the DOM as the source of truth (value, form, validation);
// a button shows the current choice and a listbox (portalled to <body> so no ancestor clips it) shows the options.
// Add data-placeholder to a <select> to hide its value="" option from the list and grey it out on the button.

let seq = 0;
const valueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
const fold = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

export function enhanceSelects(root = document) {
  root.querySelectorAll("select:not([data-sm])").forEach(enhanceSelect);
}

export function enhanceSelect(select) {
  if (select.dataset.sm) return;
  select.dataset.sm = "1";
  const id = "sm" + ++seq;
  const placeholder = select.hasAttribute("data-placeholder");

  const wrap = document.createElement("div");
  wrap.className = "sm";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "sm-btn";
  btn.setAttribute("role", "combobox");
  btn.setAttribute("aria-haspopup", "listbox");
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-controls", id + "-list");
  const val = document.createElement("span");
  val.className = "sm-val";
  btn.append(val);
  const list = document.createElement("ul");
  list.className = "sm-list";
  list.id = id + "-list";
  list.setAttribute("role", "listbox");
  list.hidden = true;

  select.before(wrap);
  wrap.append(select, btn);
  document.body.append(list);
  select.classList.add("sm-native");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  // Accessible name from <label for>, else the select's own aria-label
  const label = select.id && document.querySelector(`label[for="${CSS.escape(select.id)}"]`);
  if (label) {
    label.id ||= id + "-label";
    btn.setAttribute("aria-labelledby", label.id);
    list.setAttribute("aria-labelledby", label.id);
    label.addEventListener("click", e => { e.preventDefault(); btn.focus(); });
  } else if (select.hasAttribute("aria-label")) {
    btn.setAttribute("aria-label", select.getAttribute("aria-label"));
    list.setAttribute("aria-label", select.getAttribute("aria-label"));
  }

  let items = [], active = -1, typed = "", typedAt = 0;
  const options = () => [...select.options].filter(o => !o.disabled && !o.hidden && !(placeholder && o.value === ""));

  function render() {
    const cur = select.selectedOptions[0];
    val.textContent = cur ? cur.textContent : "";
    wrap.classList.toggle("sm-empty", placeholder && !select.value);
    btn.disabled = select.disabled;
    for (const a of ["aria-invalid", "aria-describedby"]) {
      if (select.hasAttribute(a)) btn.setAttribute(a, select.getAttribute(a)); else btn.removeAttribute(a);
    }
    if (!list.hidden) build();
  }

  function build() {
    items = options();
    list.replaceChildren(...items.map((o, i) => {
      const li = document.createElement("li");
      li.id = `${id}-o${i}`;
      li.className = "sm-opt";
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(o.selected));
      li.textContent = o.textContent;
      return li;
    }));
    setActive(active, false);
  }

  function setActive(i, scroll = true) {
    if (!items.length) { active = -1; btn.removeAttribute("aria-activedescendant"); return; }
    active = Math.max(0, Math.min(items.length - 1, i));
    [...list.children].forEach((li, k) => li.classList.toggle("sm-active", k === active));
    const li = list.children[active];
    btn.setAttribute("aria-activedescendant", li.id);
    if (scroll) li.scrollIntoView({ block: "nearest" });
  }

  function place() {
    const r = btn.getBoundingClientRect(), gap = 6, margin = 8;
    const natural = Math.min(list.scrollHeight, 300);
    const below = innerHeight - r.bottom - gap - margin, above = r.top - gap - margin;
    const up = below < natural && above > below;
    const max = Math.max(120, Math.min(300, up ? above : below));
    list.style.maxHeight = max + "px";
    list.style.minWidth = r.width + "px";
    list.style.left = Math.max(margin, Math.min(r.left, innerWidth - list.offsetWidth - margin)) + "px";
    list.style.top = (up ? r.top - gap - Math.min(natural, max) : r.bottom + gap) + "px";
    list.classList.toggle("sm-up", up);
  }

  const outside = e => { if (!wrap.contains(e.target) && !list.contains(e.target)) close(false); };

  function open() {
    if (!list.hidden || select.disabled) return;
    // A modal <dialog> sits in the top layer, so the listbox must live inside it to show above
    const host = wrap.closest("dialog") || document.body;
    if (list.parentNode !== host) host.append(list);
    build();
    list.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    wrap.classList.add("sm-open");
    place();
    setActive(Math.max(0, items.indexOf(select.selectedOptions[0])));
    addEventListener("scroll", place, true);
    addEventListener("resize", place);
    document.addEventListener("pointerdown", outside, true);
  }

  function close(refocus) {
    if (list.hidden) return;
    list.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    btn.removeAttribute("aria-activedescendant");
    wrap.classList.remove("sm-open");
    removeEventListener("scroll", place, true);
    removeEventListener("resize", place);
    document.removeEventListener("pointerdown", outside, true);
    if (refocus) btn.focus();
  }

  function pick(i) {
    const o = items[i];
    if (o && !o.selected) {
      valueDesc.set.call(select, o.value);
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    render();
    close(true);
  }

  function typeahead(ch) {
    const now = Date.now();
    typed = now - typedAt > 600 ? ch : typed + ch;
    typedAt = now;
    const q = fold(typed), start = typed.length === 1 ? active + 1 : active;
    for (let k = 0; k < items.length; k++) {
      const i = (start + k) % items.length;
      if (fold(items[i].textContent).startsWith(q)) { setActive(i); return; }
    }
  }

  btn.addEventListener("click", () => (list.hidden ? open() : close(false)));
  btn.addEventListener("blur", () => close(false));
  btn.addEventListener("keydown", e => {
    const k = e.key, isOpen = !list.hidden;
    if (!isOpen) {
      if (["ArrowDown", "ArrowUp", "Enter", " ", "Home", "End"].includes(k)) {
        e.preventDefault(); open();
        if (k === "Home") setActive(0); else if (k === "End") setActive(items.length - 1);
      } else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { open(); typeahead(k); }
      return;
    }
    const moves = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: items.length - 1, PageDown: active + 5, PageUp: active - 5 };
    if (k in moves) { e.preventDefault(); setActive(moves[k]); }
    else if (k === "Enter" || (k === " " && Date.now() - typedAt > 600)) { e.preventDefault(); pick(active); }
    else if (k === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (k === "Tab") close(false);
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); typeahead(k); }
  });
  list.addEventListener("pointerdown", e => e.preventDefault()); // keep focus on the button
  list.addEventListener("click", e => { const li = e.target.closest(".sm-opt"); if (li) pick([...list.children].indexOf(li)); });
  list.addEventListener("pointermove", e => {
    const li = e.target.closest(".sm-opt");
    if (li) { const i = [...list.children].indexOf(li); if (i !== active) setActive(i, false); }
  });

  // Keep the button in step with the native select: option text (language switch), added options,
  // validation attributes, change events and programmatic `select.value = ...`.
  new MutationObserver(render).observe(select, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ["aria-invalid", "aria-describedby", "disabled", "selected", "hidden"]
  });
  select.addEventListener("change", render);
  Object.defineProperty(select, "value", {
    configurable: true,
    get() { return valueDesc.get.call(this); },
    set(v) { valueDesc.set.call(this, v); render(); }
  });
  select.focus = () => btn.focus(); // callers focusing the select (e.g. validation) land on the visible control

  render();
}
