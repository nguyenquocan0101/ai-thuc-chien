import { readFile } from "node:fs/promises";
import path from "node:path";
import { isIP } from "node:net";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  GoogleAuthProvider,
  inMemoryPersistence,
  initializeAuth,
  signInWithCredential,
  signOut,
} from "firebase/auth";
import { CLASSES } from "../src/scripts/course.js";
import { firebaseConfig as webFirebaseConfig } from "../src/lib/firebase-config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectConfig = JSON.parse(await readFile(path.join(root, ".firebaserc"), "utf8"));
const configFile = process.argv[2] || "firebase.json";
const firebaseConfig = JSON.parse(await readFile(path.resolve(root, configFile), "utf8"));
const projectId = projectConfig.projects?.default;
const emulatorHost = firebaseConfig.emulators?.firestore?.host;
const emulatorPort = firebaseConfig.emulators?.firestore?.port;
const authHost = firebaseConfig.emulators?.auth?.host;
const authPort = firebaseConfig.emulators?.auth?.port;
const databaseId = firebaseConfig.firestore?.database || "(default)";
const localInterfaceAddresses = new Set(Object.values(networkInterfaces()).flatMap(items =>
  (items || []).filter(item => item.family === "IPv4" && !item.internal).map(item => item.address)
));
const isLocalEmulatorHost = host => host === "localhost" || host === "::1"
  || isIP(host) === 4 && (host.startsWith("127.") || localInterfaceAddresses.has(host));

if (!projectId || !emulatorHost || !emulatorPort) {
  throw new Error("Missing Firebase project or Firestore emulator configuration.");
}
if (!isLocalEmulatorHost(emulatorHost)) {
  throw new Error("Refusing to seed anywhere except a loopback or local-interface Firestore emulator.");
}
if (!isLocalEmulatorHost(authHost)) {
  throw new Error("Refusing to seed anywhere except a loopback or local-interface Auth emulator.");
}

const firestoreConnectHost = emulatorHost;
const authConnectHost = authHost;
const emulatorHostUrl = firestoreConnectHost.includes(":") ? `[${firestoreConnectHost}]` : firestoreConnectHost;
const baseUrl = `http://${emulatorHostUrl}:${emulatorPort}/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents`;
const nowMs = Date.now();
const now = new Date(nowMs).toISOString();
const students = [
  { email: "linh.nguyen@example.test", name: "Nguyễn Minh Linh", studentId: "SE123456", major: "SE", term: "3", classId: "modern", confirmed: true },
  { email: "minh.tran@example.test", name: "Trần Gia Minh", studentId: "AI234567", major: "AI", term: "4", classId: "harness", confirmed: true },
  { email: "an.pham@example.test", name: "Phạm Hoàng An", studentId: "IS345678", major: "IS", term: "2", confirmed: false },
  { email: "ha.le@example.test", name: "Lê Ngọc Hà", studentId: "IA456789", major: "IA", term: "8", classId: "modern", confirmed: true },
  { email: "quan.vo@example.test", name: "Võ Đức Quân", studentId: "SE567890", major: "SE", term: "8", classId: "harness", confirmed: true },
  { email: "vy.do@example.test", name: "Đỗ Khánh Vy", studentId: "AI678901", major: "AI", term: "9", classId: "modern", confirmed: false },
  { email: "khoa.bui@example.test", name: "Bùi Đăng Khoa", studentId: "SE789012", major: "SE", term: "9", classId: "harness", confirmed: true },
  { email: "my.hoang@example.test", name: "Hoàng Ngọc My", studentId: "IS890123", major: "IS", term: "1", classId: "modern", confirmed: true },
  { email: "duc.ngo@example.test", name: "Ngô Anh Đức", studentId: "IA901234", major: "IA", term: "1", classId: "harness", confirmed: false },
  { email: "thao.dang@example.test", name: "Đặng Phương Thảo", studentId: "SE012345", major: "SE", term: "2", classId: "modern", confirmed: true },
  { email: "nam.huynh@example.test", name: "Huỳnh Quốc Nam", studentId: "AI112233", major: "AI", term: "2", classId: "harness", confirmed: true },
  { email: "trang.nguyen@example.test", name: "Nguyễn Bảo Trang", studentId: "IS223344", major: "IS", term: "5", classId: "modern", confirmed: false },
  { email: "long.pham@example.test", name: "Phạm Thành Long", studentId: "IA334455", major: "IA", term: "5", classId: "harness", confirmed: true },
  { email: "nhu.vo@example.test", name: "Võ Mỹ Như", studentId: "SE445566", major: "SE", term: "6", classId: "modern", confirmed: true },
  { email: "tuan.le@example.test", name: "Lê Minh Tuấn", studentId: "AI556677", major: "AI", term: "6", classId: "harness", confirmed: false },
  { email: "mai.dinh@example.test", name: "Đinh Hoài Mai", major: "OTHER", term: "7", classId: "modern", confirmed: false },
  { email: "phuc.tran@example.test", name: "Trần Minh Phúc", studentId: "SE667788", major: "SE", term: "7", confirmed: true },
  { email: "yen.nguyen@example.test", name: "Nguyễn Thùy Yến", studentId: "IS778899", major: "IS", confirmed: false },
];

const pendingRegistrations = [
  { email: "thanh.dao@example.test", name: "Đào Nhật Thành", studentId: "SE889900", major: "SE", term: "3", lang: "vi" },
  { email: "chi.nguyen@example.test", name: "Nguyễn Hải Chi", major: "AI", term: "4", lang: "en" },
  { email: "phong.ly@example.test", name: "Lý Hoàng Phong", studentId: "IS990011", major: "IS", term: "8", lang: "vi" },
];

const encode = value => {
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (value && typeof value === "object") {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
  }
  return { nullValue: null };
};

const toFields = value => Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
const docs = [];
const registrationRows = [...students, ...pendingRegistrations];

for (const [index, row] of registrationRows.entries()) {
  const { confirmed, classId, ...profile } = row;
  const registration = {
    ...profile,
    pledge: true,
    lang: row.lang || (index % 4 === 0 ? "en" : "vi"),
    createdAt: new Date(nowMs - (index + 2) * 86400000),
  };
  docs.push({ collection: "registrations", id: row.email, fields: toFields(registration) });
}

// One legacy UID-keyed document exercises the older registration shape.
docs.push({
  collection: "registrations",
  id: "mock-legacy-user-001",
  fields: toFields({
    uid: "mock-legacy-user-001",
    name: "Tài khoản cũ Mock",
    email: "legacy.account@example.test",
    studentId: "SE101010",
    major: "SE",
    term: "1",
    pledge: true,
    lang: "vi",
    createdAt: new Date(nowMs - 45 * 86400000),
    updatedAt: new Date(nowMs - 30 * 86400000),
  }),
});

for (const row of students) {
  const { confirmed, ...profile } = row;
  const student = {
    ...profile,
    ...(confirmed ? { infoConfirmedAt: new Date(nowMs - 2 * 86400000) } : {}),
  };
  docs.push({ collection: "students", id: row.email, fields: toFields(student) });
}

for (const [index, row] of students.filter((_, i) => i % 3 === 0).entries()) {
  docs.push({
    collection: "availability",
    id: row.email,
    fields: toFields({
      sessionIds: index % 2 === 0 ? ["mock-session-1", "mock-session-3"] : ["mock-session-2"],
      updatedAt: new Date(nowMs - index * 3600000),
    }),
  });
}

const scheduleSessions = Object.entries(CLASSES).flatMap(([classId, cls]) =>
  cls.sessions.map((session, index) => ({ id: `${classId}-${index + 1}`, classId, ...session })),
);

docs.push(
  {
    collection: "schedule",
    id: "config",
    fields: toFields({
      status: "published",
      zalo: { modern: "", harness: "" },
      updatedAt: new Date(now),
    }),
  },
  {
    collection: "schedule",
    id: "classes",
    fields: toFields({
      classes: Object.fromEntries(Object.entries(CLASSES).map(([id, cls]) => [id, { name: cls.name, short: cls.short }])),
      sessions: scheduleSessions,
      updatedAt: new Date(now),
    }),
  },
);

try {
  await fetch(`http://${emulatorHostUrl}:${emulatorPort}/`, { signal: AbortSignal.timeout(1500) });
  await fetch(`http://${authConnectHost}:${authPort}/`, { signal: AbortSignal.timeout(1500) });
} catch {
  throw new Error("Auth or Firestore emulator is not reachable. Start both with npm run emulators first.");
}

const demoAccounts = [
  { sub: "local-demo-admin", email: "phuonglhk@gmail.com", name: "Demo Admin" },
  { sub: "local-demo-student-linh", email: "linh.nguyen@example.test", name: "Nguyễn Minh Linh" },
];
const authApp = initializeApp(webFirebaseConfig, `emulator-seed-${process.pid}`);
const auth = initializeAuth(authApp, { persistence: inMemoryPersistence });
connectAuthEmulator(auth, `http://${authConnectHost}:${authPort}`, { disableWarnings: true });
for (const account of demoAccounts) {
  const idpCredential = GoogleAuthProvider.credential(JSON.stringify({ ...account, email_verified: true }));
  await signInWithCredential(auth, idpCredential);
  await signOut(auth);
}
const authAccountsResponse = await fetch(
  `http://${authConnectHost}:${authPort}/identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:query`,
  { method: "POST", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: "{}" },
);
if (!authAccountsResponse.ok) throw new Error(`Could not verify seeded Auth Emulator accounts (${authAccountsResponse.status}).`);
const authAccounts = await authAccountsResponse.json();
const authEmails = new Set((authAccounts.userInfo || []).map(account => account.email));
const missingDemoEmails = demoAccounts.filter(account => !authEmails.has(account.email)).map(account => account.email);
if (missingDemoEmails.length) throw new Error(`Auth Emulator is missing demo accounts: ${missingDemoEmails.join(", ")}.`);

for (const document of docs) {
  const url = `${baseUrl}/${encodeURIComponent(document.collection)}/${encodeURIComponent(document.id)}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ fields: document.fields }),
  });
  if (!response.ok) {
    throw new Error(`Emulator write failed (${response.status}) at ${document.collection}/${document.id}.`);
  }
}

console.log(`Seeded ${docs.length} mock Firestore documents.`);
console.log(`registrations: ${registrationRows.length} email-keyed + 1 legacy UID; students: ${students.length}; availability: ${students.filter((_, i) => i % 3 === 0).length}; schedule/config + schedule/classes.`);
console.log("Auth Emulator accounts seeded: admin and student demo roles.");
console.log("All student names, IDs, and example.test emails are synthetic; only loopback or locally bound emulators were written.");
