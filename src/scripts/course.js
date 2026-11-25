/* ===== Thông tin chương trình: sửa ở đây. null = "Sẽ cập nhật". Có thể ghi chuỗi, hoặc { vi: "...", en: "..." } ===== */
export const COURSE = {
  period: { vi: "Tuần 13 · 30/11 – 04/12/2026", en: "Week 13 · 30 Nov – 4 Dec 2026" },
  days: { vi: "Thứ 2, 4, 6", en: "Mon, Wed, Fri" },
  time: "08:00 – 12:00, 13:00 – 17:00",
  room: null,        // mỗi lớp một phòng, xem CLASSES
  deadline: null,
  seats: null,
  resultDate: null
};

/* Hai lớp học song song trong tuần 13 (theo file lịch Excel của ban tổ chức).
 * Sinh viên thuộc lớp nào ghi ở students/{email}.classId (admin xếp ở tab Sinh viên); mỗi lớp học đủ các buổi của lớp đó.
 * date dạng YYYY-MM-DD (giờ Việt Nam). Đổi id lớp thì dữ liệu classId đã lưu sẽ không khớp nữa. */
export const CLASSES = {
  modern: {
    name: "Modern AI Software Developer",
    short: "Modern AI",
    sessions: [
      { date: "2026-11-30", from: "08:00", to: "12:00", room: "Seminar – Thư viện", topic: "Introduction to AI-Augmented Software Engineering" },
      { date: "2026-11-30", from: "13:00", to: "17:00", room: "Seminar – Thư viện", topic: "Prompt Engineering & Context Engineering" },
      { date: "2026-12-02", from: "08:00", to: "12:00", room: "Seminar – Thư viện", topic: "AI-Assisted Requirements & Software Design" },
      { date: "2026-12-02", from: "13:00", to: "17:00", room: "Seminar – Thư viện", topic: "AI Coding Agents & Software Implementation" },
      { date: "2026-12-04", from: "08:00", to: "12:00", room: "Seminar – Thư viện", topic: "AI-Assisted Testing, Debugging & Code Review" },
      { date: "2026-12-04", from: "13:00", to: "18:00", room: "LB24", topic: "Project Integration, Demo & Evaluation" }
    ]
  },
  harness: {
    name: "Harness Engineering",
    short: "Harness",
    sessions: [
      { date: "2026-11-30", from: "08:00", to: "12:00", room: "P313", topic: "Introduction to Harness Engineering & Agent Architecture" },
      { date: "2026-11-30", from: "13:00", to: "17:00", room: "P313", topic: "Context, Repository & Knowledge Engineering" },
      { date: "2026-12-02", from: "08:00", to: "12:00", room: "P310", topic: "Tool Engineering, Runtime & Guardrails" },
      { date: "2026-12-02", from: "13:00", to: "17:00", room: "P310", topic: "Agent Orchestration, State & Recovery" },
      { date: "2026-12-04", from: "08:00", to: "12:00", room: "P313", topic: "Verification, Observability & Continuous Improvement" },
      { date: "2026-12-04", from: "13:00", to: "18:00", room: "P313", topic: "Harness Integration, Benchmarking, Demo & Evaluation" }
    ]
  }
};
