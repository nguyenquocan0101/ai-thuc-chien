import { LANG } from "../i18n.js";
import { reduce } from "./utils.js";

export function initQuiz() {
  /* ---------- "Soi code AI" dạng diff: mỗi tab là một đoạn AI viết, đỏ là chỗ sai, xanh là cách sửa ---------- */
  // d: dòng diff, ký tự đầu là " " (giữ), "-" (bỏ), "+" (thêm)
  const QZ = [
    { ok: false, file: "db/schema.sql",
      vi: ["Thiết kế bảng dữ liệu cho chức năng đăng ký khóa học.", "AI quên ràng buộc UNIQUE (student_id, course_id), nên một bạn bấm đăng ký hai lần là có hai bản ghi. Thêm một dòng ở bước thiết kế rẻ hơn nhiều so với dọn dữ liệu trùng sau này."],
      en: ["Design the table for course registration.", "The AI forgot UNIQUE (student_id, course_id), so a student who clicks twice gets two rows. One line at design time is far cheaper than cleaning duplicates later."],
      d: [" CREATE TABLE registrations (", "   id         SERIAL PRIMARY KEY,", "   student_id TEXT NOT NULL,", "   course_id  INT  NOT NULL,", "-  created_at TIMESTAMP DEFAULT now()", "+  created_at TIMESTAMP DEFAULT now(),", "+  UNIQUE (student_id, course_id)", " );"] },
    { ok: true, file: "tests/email.test.js",
      vi: ["Viết test cho hàm kiểm tra email trường @fpt.edu.vn.", "Đoạn này ổn: test có cả email viết hoa và email giả đuôi .com, đúng những chỗ AI hay bỏ sót. AI đề xuất, còn bạn là người quyết định test vậy đã đủ chưa."],
      en: ["Write tests for the @fpt.edu.vn email check.", "This one is fine: it covers an all-caps email and a fake one ending in .com, exactly where AI tends to slip. AI suggests; you decide whether the tests are enough."],
      d: ["+test(\"accepts only @fpt.edu.vn\", () => {", "+  expect(isSchoolEmail(\"an@fpt.edu.vn\")).toBe(true);", "+  expect(isSchoolEmail(\"AN@FPT.EDU.VN\")).toBe(true);", "+  expect(isSchoolEmail(\"an@fpt.edu.vn.com\")).toBe(false);", "+});"] },
    { ok: false, file: "src/api.js",
      vi: ["Deploy bản demo lên mạng để cả lớp cùng thử.", "Web đã lên mạng nhưng vẫn gọi API ở localhost, nên trên máy người khác bấm nút nào cũng lỗi, đúng lúc demo. Đưa địa chỉ API vào biến môi trường là xong."],
      en: ["Deploy the demo so the whole class can try it.", "The site is live but still calls the API on localhost, so every button fails on anyone else's machine, right at demo time. Move the API URL into an environment variable."],
      d: [" // src/api.js", "-export const API_URL = \"http://localhost:3000\";", "+export const API_URL = import.meta.env.VITE_API_URL;", " ", " $ vercel --prod", " ✓ Deployed to ai-thuc-chien.vercel.app"] },
  ];
  const QT = {
    vi: { you: "Bạn nhờ AI", ai: "Thay đổi AI đề xuất", fix: "Cần sửa", pass: "Đạt" },
    en: { you: "You asked AI", ai: "AI's proposed change", fix: "Needs a fix", pass: "Approved" },
  };
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paint = s => esc(s).replace(/("[^"]*"|'[^']*')/g, '<span class="s">$1</span>').replace(/^(\s*\/\/.*)$/, '<span class="c">$1</span>').replace(/^(\$ .*)$/, '<span class="c">$1</span>');
  const ma = document.getElementById("modArt"), tabsL = [...document.querySelectorAll(".lab-tab")];
  let cur = 0;
  const L = () => QT[LANG] || QT.vi;
  const renderQ = () => {
    const q = QZ[cur], l = L(), txt = q[LANG] || q.vi;
    let nw = 0;
    const rows = q.d.map(x => {
      const t = x[0], c = x.slice(1), cls = t === "+" ? "add" : t === "-" ? "del" : "";
      const b = t === "-" ? "" : ++nw;
      return `<div class="ln ${cls}"><span class="g">${b}</span><span class="sg">${t === " " ? "" : t === "-" ? "−" : "+"}</span><code>${paint(c)}</code></div>`;
    }).join("");
    ma.innerHTML = `<div class="qz-win">
      <div class="qz-bar"><i></i><i></i><i></i><span class="qz-file">${q.file}</span></div>
      <div class="qz-body">
        <p class="qz-ask"><span>${l.you}</span>${esc(txt[0])}</p>
        <div class="qz-code" aria-label="${l.ai}">${rows}</div>
        <div class="qz-res ${q.ok ? "hit" : "miss"}" role="status"><span class="qz-v">${q.ok ? "✓ " + l.pass : "✗ " + l.fix}</span><p>${esc(txt[1])}</p></div>
      </div></div>`;
    tabsL.forEach((b, i) => { b.classList.toggle("on", i === cur); b.setAttribute("aria-selected", i === cur); });
  };
  const go = k => { cur = k; renderQ(); };
  tabsL.forEach((b, k) => b.addEventListener("click", () => go(k)));
  const stairs = document.querySelector(".stairs");
  if (!reduce) { stairs.classList.add("pending"); new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) stairs.classList.remove("pending"); }), { threshold: 0.2 }).observe(stairs); }
  document.getElementById("langBtn").addEventListener("click", () => setTimeout(renderQ, 0));
  renderQ();
}
