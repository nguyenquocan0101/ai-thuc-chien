import { patchGlassEdges, stretchGlassBlocks } from "./scripts/glass.js";
import { initLang } from "./scripts/i18n.js";
import { initScheduleCta } from "./scripts/schedule-cta.js";
import { initReveal } from "./scripts/reveal.js";
import { initShowcase } from "./scripts/showcase/index.js";

// Giữ đúng thứ tự chạy của bản một file cũ
patchGlassEdges();
initLang();
stretchGlassBlocks();
initScheduleCta();
initReveal();
initShowcase();
