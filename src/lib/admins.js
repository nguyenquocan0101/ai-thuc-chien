// Accounts allowed into /admin. Keep in sync with isAdmin() in firestore.rules,
// which is what actually protects the data.
export const ADMIN_EMAILS = ["phuonglhk@gmail.com", "nguyenquocan1010@gmail.com"];

export const isAdminEmail = email => ADMIN_EMAILS.includes(String(email || "").trim().toLowerCase());
