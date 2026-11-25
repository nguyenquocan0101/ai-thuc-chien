// Clawd (chú cua pixel của Claude Code) giơ icon Zalo, bò ngang dọc mép màn hình, chân bám vào mép; bấm vào là mở nhóm Zalo.
// Máy tính: bong bóng "Zalo nè!" luôn hiện, quay về phía giữa màn hình. Điện thoại: bong bóng hiện 4 giây, 15 giây một lần.
// Rê chuột hoặc focus thì dừng lại; prefers-reduced-motion thì đứng yên ở góc dưới bên phải.
// const walker = createClawdWalker(); walker.show(url); walker.hide();

const ZALO = "M12.49 10.2722v-.4496h1.3467v6.3218h-.7704a.576.576 0 01-.5763-.5729l-.0006.0005a3.273 3.273 0 01-1.9372.6321c-1.8138 0-3.2844-1.4697-3.2844-3.2823 0-1.8125 1.4706-3.2822 3.2844-3.2822a3.273 3.273 0 011.9372.6321l.0006.0005zM6.9188 7.7896v.205c0 .3823-.051.6944-.2995 1.0605l-.03.0343c-.0542.0615-.1815.206-.2421.2843L2.024 14.8h4.8948v.7682a.5764.5764 0 01-.5767.5761H0v-.3622c0-.4436.1102-.6414.2495-.8476L4.8582 9.23H.1922V7.7896h6.7266zm8.5513 8.3548a.4805.4805 0 01-.4803-.4798v-7.875h1.4416v8.3548H15.47zM20.6934 9.6C22.52 9.6 24 11.0807 24 12.9044c0 1.8252-1.4801 3.306-3.3066 3.306-1.8264 0-3.3066-1.4808-3.3066-3.306 0-1.8237 1.4802-3.3044 3.3066-3.3044zm-10.1412 5.253c1.0675 0 1.9324-.8645 1.9324-1.9312 0-1.065-.865-1.9295-1.9324-1.9295s-1.9324.8644-1.9324 1.9295c0 1.0667.865 1.9312 1.9324 1.9312zm10.1412-.0033c1.0737 0 1.945-.8707 1.945-1.9453 0-1.073-.8713-1.9436-1.945-1.9436-1.0753 0-1.945.8706-1.945 1.9436 0 1.0746.8697 1.9453 1.945 1.9453z";

// Cùng tỉ lệ khối với model 3D trên trang chủ: thân 9×6, mắt 1×1, 4 chân (2 cặp bước so le); hai càng giơ lên kẹp icon Zalo
// (ô xanh bo góc, bong bóng trắng, chữ Zalo). Hình nằm trong ô vuông, chân sát cạnh dưới: xoay ô là chân bám đúng mép màn hình.
const MARKUP = `
  <span class="cw-bubble">Zalo nè! Vào nhóm lớp nha</span>
  <span class="cw-body">
    <svg class="cw-art" viewBox="0 0 20 20" aria-hidden="true">
      <g class="cw-logo" shape-rendering="geometricPrecision">
        <rect x="5" y="0" width="9" height="9" rx="2.2" fill="#0068FF"/>
        <rect x="6" y="1.5" width="7" height="5.2" rx="2.4" fill="#fff"/>
        <path d="M7.1 6.2 6.5 8 8.9 6.6z" fill="#fff"/>
        <path fill="#0068FF" transform="translate(6.7 1.3) scale(.233)" d="${ZALO}"/>
      </g>
      <g shape-rendering="crispEdges">
        <g fill="#D97757"><rect x="5" y="12" width="9" height="6"/><rect x="4" y="5" width="1" height="8"/><rect x="14" y="5" width="1" height="8"/>
          <rect x="3" y="4" width="2" height="1"/><rect x="14" y="4" width="2" height="1"/><rect x="3" y="6" width="2" height="1"/><rect x="14" y="6" width="2" height="1"/></g>
        <g fill="#17141F" class="cw-eyes"><rect x="6" y="13" width="1" height="1"/><rect x="12" y="13" width="1" height="1"/></g>
        <g fill="#D97757" class="cw-legs-a"><rect x="5" y="18" width="1" height="2"/><rect x="11" y="18" width="1" height="2"/></g>
        <g fill="#D97757" class="cw-legs-b"><rect x="7" y="18" width="1" height="2"/><rect x="13" y="18" width="1" height="2"/></g>
      </g>
    </svg>
  </span>`;

export function createClawdWalker() {
  const el = document.createElement("a");
  el.className = "clawd-walker";
  el.target = "_blank";
  el.rel = "noopener";
  el.setAttribute("aria-label", "Vào nhóm Zalo của lớp");
  el.innerHTML = MARKUP;
  el.hidden = true;
  document.body.append(el);
  const body = el.querySelector(".cw-body"), logo = el.querySelector(".cw-logo");

  const still = matchMedia("(prefers-reduced-motion: reduce)");
  let raf = 0, last = 0, dist = 0, paused = false, talkTimer = 0, talkStart = 0;
  const TALK_EVERY = 15000, TALK_FOR = 4000;

  // Lớp is-talking chỉ có tác dụng trên màn hình hẹp (CSS); màn hình rộng thì bong bóng luôn hiện
  const talk = () => { el.classList.add("is-talking"); setTimeout(() => el.classList.remove("is-talking"), TALK_FOR); };

  // Đường bò: sát bốn mép màn hình (cạnh trên là mép dưới thanh tiêu đề), theo chiều kim đồng hồ: trên → phải → dưới → trái
  function track() {
    const s = el.offsetWidth, vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    const top = document.querySelector(".bar")?.offsetHeight || 0;
    const x0 = 0, x1 = Math.max(0, vw - s), y0 = top, y1 = Math.max(top, vh - s);
    return { x0, x1, y0, y1, len: 2 * (x1 - x0) + 2 * (y1 - y0) };
  }

  function place(d) {
    const t = track(), a = t.x1 - t.x0, b = t.y1 - t.y0;
    const lap = Math.floor(d / t.len);
    let p = d - lap * t.len, x, y, edge;
    if (p < a) { x = t.x0 + p; y = t.y0; edge = 0; }
    else if ((p -= a) < b) { x = t.x1; y = t.y0 + p; edge = 1; }
    else if ((p -= b) < a) { x = t.x1 - p; y = t.y1; edge = 2; }
    else { p -= a; x = t.x0; y = t.y1 - p; edge = 3; }
    el.style.transform = `translate(${x}px, ${y}px)`;
    // Chân hướng về mép đang bám: trên 180°, phải 270°, dưới 360°, trái 450°; góc cộng dồn theo vòng nên luôn xoay tới, không quay ngược
    const turn = 180 + 90 * edge + 360 * lap;
    body.style.transform = `rotate(${turn}deg)`;
    logo.style.transform = `rotate(${-turn}deg)`; // logo xoay ngược lại nên chữ Zalo luôn đứng thẳng, đọc được
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
    if (still.matches) { const t = track(); dist = (t.x1 - t.x0) + (t.y1 - t.y0); place(dist); return; } // đầu cạnh dưới, góc phải
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
      talkStart = setTimeout(talk, 2000);
      talkTimer = setInterval(talk, TALK_EVERY);
    },
    hide() {
      el.hidden = true;
      cancelAnimationFrame(raf);
      clearTimeout(talkStart);
      clearInterval(talkTimer);
      el.classList.remove("is-talking");
    }
  };
}
