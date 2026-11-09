/* ===== Hiện dần các khối dưới màn hình đầu ===== */
export function initReveal() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
  const els = [...document.querySelectorAll(".rv")].filter(el => el.getBoundingClientRect().top > innerHeight * 0.95);
  els.forEach(el => el.classList.add("pending"));
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.remove("pending"); io.unobserve(en.target); } });
  }, { rootMargin: "0px 0px -8% 0px" });
  els.forEach(el => io.observe(el));
}
