import { I18N, LANG } from "../i18n.js";

export const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => t * t * (3 - 2 * t);
export const tr = k => (typeof I18N !== "undefined" && I18N[LANG] && I18N[LANG][k]) || "";
