/* Liquid glass: thay viền trắng đậm mặc định bằng một đường sáng rất mảnh */
export function patchGlassEdges() {
  (function () {
    const C = customElements.get("glass-element");
    if (!C || !C.prototype.applyDynamicStyles) return;
    const orig = C.prototype.applyDynamicStyles;
    C.prototype.applyDynamicStyles = function (box) {
      orig.call(this, box);
      box.style.boxShadow = this.getAttribute("edge") || "inset 0 1px 0 rgba(255,255,255,.10)";
      box.style.border = "none";
    };
  })();
}

/* Liquid glass: thẻ khối giãn đủ chiều rộng cột */
export function stretchGlassBlocks() {
  document.querySelectorAll("glass-element.block").forEach(h => {
    const set = () => h.style.setProperty("--w", h.clientWidth + "px");
    set(); if ("ResizeObserver" in window) new ResizeObserver(set).observe(h);
  });
}
