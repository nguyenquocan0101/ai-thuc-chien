import { I18N, applyLang } from "../i18n.js";

export function applyCopy() {
  /* ---------- Chữ 6 bước viết lại cho sinh viên (ghi đè từ điển gốc) ---------- */
  if (typeof I18N !== "undefined") {
    Object.assign(I18N.vi, {
      "val.eyebrow": "Khóa học này dạy gì", "val.title": "Làm phần mềm thật, với AI là đồng đội.",
      "val.lead": "Trong khóa học, bạn cùng nhóm làm một ứng dụng web từ ý tưởng đến bản demo chạy thật. AI viết code cùng bạn, còn bạn học cách giao việc, kiểm tra và chịu trách nhiệm với sản phẩm cuối cùng. Không cần biết trước về AI, chỉ cần biết lập trình cơ bản.",
      "val.k1": "Quy trình", "val.h1": "Dùng AI ở mọi bước, không chỉ lúc code", "val.p1": "Từ phân tích yêu cầu, thiết kế, lập trình đến kiểm thử, bạn biết lúc nào nên nhờ AI và nhờ thế nào cho đúng. Bạn học một cách làm việc, không học thuộc một công cụ.",
      "val.k2": "Kiểm chứng", "val.h2": "AI đề xuất, bạn quyết định", "val.p2": "AI có thể viết sai, bịa ra thư viện hoặc bỏ sót trường hợp khó. Bạn luyện thói quen viết test, đọc từng thay đổi và review code để bắt lỗi trước khi nó tới tay người dùng.",
      "val.k3": "Sản phẩm", "val.h3": "Có sản phẩm thật để đưa vào CV", "val.p3": "Cả nhóm làm một dự án từ user story đến bản demo chạy được. Buổi cuối, nhóm trình bày sản phẩm và kể lại AI đã giúp ở đâu, sai ở đâu. Đó cũng là điều nhà tuyển dụng muốn nghe.",
      "foot.eyebrow": "Học tiếp sau khóa", "foot.title": "Harness Engineering: làm chủ AI coding agent", "foot.text": "Thư viện kiến thức tiếng Việt của chúng tôi về cách dựng môi trường cho AI agent làm việc đáng tin cậy: từ bối cảnh, trạng thái đến kiểm chứng tự động.", "foot.t1": "Dựng môi trường", "foot.t2": "Quản lý bối cảnh", "foot.t3": "Kiểm chứng tự động", "foot.cta": "Khám phá learnharness.org",
      "mods.title": "6 bước, từ ý tưởng đến sản phẩm chạy thật.", "top.out": "Đầu ra", "hero.slogan": "Không chỉ Vibe Coding, hãy <b>Build Like an Engineer!</b>",
      "top.t1": "AI trong nghề làm phần mềm", "top.d1": "Biết AI giỏi ở đâu, hay sai ở đâu, để giao đúng việc ngay từ buổi đầu.", "top.o1": "Repo dự án của nhóm và nhật ký dùng AI",
      "top.t2": "Prompt & bối cảnh", "top.d2": "Viết yêu cầu để AI hiểu ý bạn ngay lần đầu, khỏi sửa đi sửa lại.", "top.o2": "Bản đặc tả và file bối cảnh giúp agent làm đúng ý",
      "top.t3": "Từ ý tưởng đến thiết kế", "top.d3": "Biến ý tưởng thành user story, sơ đồ dữ liệu và API trước khi viết dòng code nào.", "top.o3": "User story, ERD và đặc tả API",
      "top.t4": "Code cùng agent", "top.d4": "Lên kế hoạch, giao việc cho agent, rồi đọc từng thay đổi trước khi nhận.", "top.o4": "Một tính năng chạy thông từ giao diện xuống database",
      "top.t5": "Test, debug & review", "top.d5": "Test pass chưa phải là xong. Bạn học cách tìm lỗi AI bỏ sót và hiểu vì sao nó sai.", "top.o5": "Bộ test, báo cáo lỗi và nhận xét review",
      "top.t6": "Ghép lại, demo & tự đánh giá", "top.d6": "Đưa sản phẩm lên chạy thật, demo trước mọi người và giải thích được mọi quyết định.", "top.o6": "Sản phẩm chạy thật, buổi demo và bản tự đánh giá",
    });
    Object.assign(I18N.en, {
      "val.eyebrow": "What you'll learn", "val.title": "Build real software, with AI as your teammate.",
      "val.lead": "Over the course, your team builds a web app from idea to a live demo. AI writes code alongside you, and you learn to direct it, check it and own the final product. No AI background needed, just basic programming.",
      "val.k1": "Process", "val.h1": "Use AI at every step, not just for code", "val.p1": "From requirements and design to coding and testing, you learn when to bring AI in and how to ask well. You learn a way of working, not one tool.",
      "val.k2": "Verification", "val.h2": "AI suggests, you decide", "val.p2": "AI can be wrong, invent libraries or miss the tricky cases. You build the habit of writing tests, reading every change and reviewing code, so bugs are caught before users see them.",
      "val.k3": "Product", "val.h3": "Real software for your CV", "val.p3": "Your team builds one project from user story to working demo. On the last day you present it and explain where AI helped and where it went wrong. That's also what employers want to hear.",
      "foot.eyebrow": "Keep learning", "foot.title": "Harness Engineering: master your AI coding agent", "foot.text": "Our Vietnamese knowledge library on building the environment that makes AI agents reliable: context, state and automatic verification.", "foot.t1": "Environment setup", "foot.t2": "Context management", "foot.t3": "Automatic verification", "foot.cta": "Explore learnharness.org",
      "mods.title": "6 steps, from idea to software that really runs.", "top.out": "Deliverable", "hero.slogan": "Not just vibe coding. <b>Build like an engineer!</b>",
      "top.t1": "AI in real software work", "top.d1": "Learn where AI shines and where it slips, so you give it the right jobs from day one.", "top.o1": "Your team repo and an AI usage log",
      "top.t2": "Prompts & context", "top.d2": "Write requests AI gets right the first time, without endless back-and-forth.", "top.o2": "A spec and a context file that keep the agent on track",
      "top.t3": "From idea to design", "top.d3": "Turn an idea into user stories, a data model and an API before writing any code.", "top.o3": "User stories, ERD and API spec",
      "top.t4": "Coding with an agent", "top.d4": "Plan, hand tasks to the agent, and read every change before you accept it.", "top.o4": "One feature working end to end, from UI to database",
      "top.t5": "Test, debug & review", "top.d5": "Passing tests aren't the finish line. Learn to catch what AI missed and see why.", "top.o5": "A test suite, bug reports and review notes",
      "top.t6": "Ship, demo & reflect", "top.d6": "Put your product live, demo it, and explain every decision you made.", "top.o6": "A live product, a demo and a self-review",
    });
    if (typeof applyLang === "function") applyLang();
  }
}
