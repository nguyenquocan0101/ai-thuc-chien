import { applyCopy } from "./copy.js";
import { initHero } from "./hero3d.js";
import { initQuiz } from "./quiz.js";

/* ===== Bản phối hợp: D ở hero, C ở "Chương trình", A ở "Nội dung" ===== */
export function initShowcase() {
  // Co giãn hình vẽ (kích thước thiết kế cố định) cho vừa khung chứa
  const fits = [];
  const fit = (el, W, H) => { const inner = el.querySelector(".fit-in"); inner.style.width = W + "px"; inner.style.height = H + "px"; inner.style.margin = `${-H / 2}px 0 0 ${-W / 2}px`; fits.push([el, inner, W, H]); };
  const refit = () => fits.forEach(([el, inner, W, H]) => { inner.style.transform = `scale(${Math.min(el.clientWidth / W, el.clientHeight / H).toFixed(3)})`; });
  addEventListener("resize", refit);
  applyCopy();
  const onView = (els, cb) => { const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) cb(e.target); }), { rootMargin: "-42% 0px -42% 0px" }); els.forEach(el => io.observe(el)); };

  const stepHero = initHero();
  let mx = 0, my = 0, sx = 0, sy = 0;
  addEventListener("pointermove", e => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; });

  initQuiz();
  refit();
  let last = performance.now();
  const loop = now => {
    const t = now / 1000, dt = Math.min(0.05, (now - last) / 1000); last = now;
    sx += (mx - sx) * 0.05; sy += (my - sy) * 0.05;
    stepHero(t, sx, sy);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
