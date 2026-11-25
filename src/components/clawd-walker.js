// Clawd (chú cua pixel của Claude Code) đội biển Zalo, bò vòng quanh mép màn hình; bấm vào là mở nhóm Zalo.
// Máy tính: kèm bong bóng "Zalo nè!" quay về phía giữa màn hình. Điện thoại: chỉ bò vòng (CSS ẩn bong bóng).
// Rê chuột hoặc focus thì dừng lại; prefers-reduced-motion thì đứng yên ở góc dưới bên phải.
// const walker = createClawdWalker(); walker.show(url); walker.hide();

const ZALO = "M12.49 10.2722v-.4496h1.3467v6.3218h-.7704a.576.576 0 01-.5763-.5729l-.0006.0005a3.273 3.273 0 01-1.9372.6321c-1.8138 0-3.2844-1.4697-3.2844-3.2823 0-1.8125 1.4706-3.2822 3.2844-3.2822a3.273 3.273 0 011.9372.6321l.0006.0005zM6.9188 7.7896v.205c0 .3823-.051.6944-.2995 1.0605l-.03.0343c-.0542.0615-.1815.206-.2421.2843L2.024 14.8h4.8948v.7682a.5764.5764 0 01-.5767.5761H0v-.3622c0-.4436.1102-.6414.2495-.8476L4.8582 9.23H.1922V7.7896h6.7266zm8.5513 8.3548a.4805.4805 0 01-.4803-.4798v-7.875h1.4416v8.3548H15.47zM20.6934 9.6C22.52 9.6 24 11.0807 24 12.9044c0 1.8252-1.4801 3.306-3.3066 3.306-1.8264 0-3.3066-1.4808-3.3066-3.306 0-1.8237 1.4802-3.3044 3.3066-3.3044zm-10.1412 5.253c1.0675 0 1.9324-.8645 1.9324-1.9312 0-1.065-.865-1.9295-1.9324-1.9295s-1.9324.8644-1.9324 1.9295c0 1.0667.865 1.9312 1.9324 1.9312zm10.1412-.0033c1.0737 0 1.945-.8707 1.945-1.9453 0-1.073-.8713-1.9436-1.945-1.9436-1.0753 0-1.945.8706-1.945 1.9436 0 1.0746.8697 1.9453 1.945 1.9453z";

// Cùng tỉ lệ khối với model 3D trên trang chủ: thân 9×6, càng 1×2 hai bên, mắt 1×1, 4 chân (2 cặp bước so le)
const MARKUP = `
  <span class="cw-bubble">Zalo nè! Vào nhóm lớp nha</span>
  <svg class="cw-art" viewBox="0 0 15 17" shape-rendering="crispEdges" aria-hidden="true">
    <rect x="3" y="0" width="9" height="6" rx=".6" fill="#fff" stroke="#0068FF" stroke-width=".35" shape-rendering="geometricPrecision"/>
    <path fill="#0068FF" transform="translate(3.6 -.6) scale(.325)" d="${ZALO}" shape-rendering="geometricPrecision"/>
    <rect x="7" y="6" width="1" height="3" fill="#8B6A55"/>
    <g fill="#D97757"><rect x="3" y="9" width="9" height="6"/><rect x="2" y="10.5" width="1" height="2"/><rect x="12" y="10.5" width="1" height="2"/></g>
    <g fill="#17141F" class="cw-eyes"><rect x="4" y="10" width="1" height="1"/><rect x="10" y="10" width="1" height="1"/></g>
    <g fill="#D97757" class="cw-legs-a"><rect x="3" y="15" width="1" height="2"/><rect x="9" y="15" width="1" height="2"/></g>
    <g fill="#D97757" class="cw-legs-b"><rect x="5" y="15" width="1" height="2"/><rect x="11" y="15" width="1" height="2"/></g>
  </svg>`;

export function createClawdWalker() {
  const el = document.createElement("a");
  el.className = "clawd-walker";
  el.target = "_blank";
  el.rel = "noopener";
  el.setAttribute("aria-label", "Vào nhóm Zalo của lớp");
  el.innerHTML = MARKUP;
  el.hidden = true;
  document.body.append(el);

  const still = matchMedia("(prefers-reduced-motion: reduce)");
  let raf = 0, last = 0, dist = 0, paused = false;

  // Đường bò: hình chữ nhật sát mép màn hình (chừa thanh trên cùng), đi theo chiều kim đồng hồ
  function track() {
    const w = el.offsetWidth, h = el.offsetHeight, m = innerWidth < 700 ? 6 : 14;
    const top = (document.querySelector(".bar")?.offsetHeight || 0) + m;
    const x0 = m, x1 = Math.max(m, innerWidth - w - m), y0 = top, y1 = Math.max(top, innerHeight - h - m);
    return { x0, x1, y0, y1, len: 2 * (x1 - x0) + 2 * (y1 - y0) };
  }

  function place(d) {
    const t = track(), a = t.x1 - t.x0, b = t.y1 - t.y0;
    let p = ((d % t.len) + t.len) % t.len, x, y;
    if (p < a) { x = t.x0 + p; y = t.y0; }
    else if ((p -= a) < b) { x = t.x1; y = t.y0 + p; }
    else if ((p -= b) < a) { x = t.x1 - p; y = t.y1; }
    else { p -= a; x = t.x0; y = t.y1 - p; }
    el.style.transform = `translate(${x}px, ${y}px)`;
    // bong bóng quay về phía giữa màn hình để không tràn ra ngoài
    el.classList.toggle("is-right", x > innerWidth / 2);
    el.classList.toggle("is-bottom", y > innerHeight / 2);
  }

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!paused) dist += dt * (innerWidth < 700 ? 55 : 90);
    place(dist);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    cancelAnimationFrame(raf);
    el.classList.toggle("is-still", still.matches);
    if (still.matches) { const t = track(); dist = 2 * (t.x1 - t.x0) + (t.y1 - t.y0); place(dist); return; } // góc dưới bên phải
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  const pause = on => () => { paused = on; el.classList.toggle("is-paused", on); };
  el.addEventListener("pointerenter", pause(true));
  el.addEventListener("pointerleave", pause(false));
  el.addEventListener("focus", pause(true));
  el.addEventListener("blur", pause(false));
  still.addEventListener("change", () => { if (!el.hidden) start(); });
  addEventListener("resize", () => { if (!el.hidden) place(dist); });

  return {
    show(url) {
      el.href = url;
      if (!el.hidden) return;
      el.hidden = false;
      start();
    },
    hide() {
      el.hidden = true;
      cancelAnimationFrame(raf);
    }
  };
}
