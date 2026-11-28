import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithCredential, signOut, onAuthStateChanged, connectAuthEmulator } from "firebase/auth";
import { getFirestore, collection, doc, getDoc, setDoc, updateDoc, writeBatch, query, where, orderBy, onSnapshot, serverTimestamp, Timestamp, connectFirestoreEmulator } from "firebase/firestore";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const registrations = collection(db, "registrations");

// Development luôn dùng emulator để không đọc/ghi nhầm Firebase thật.
if (import.meta.env.DEV) {
  const emulatorHost = import.meta.env.VITE_FIREBASE_EMULATOR_HOST || window.location.hostname || "127.0.0.1";
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, emulatorHost, 8181);
}

export async function signInWithGoogle(params = {}) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account", ...params });
  const { user } = await signInWithPopup(auth, provider);
  return user;
}

export async function signInWithDemoRole(role) {
  if (!import.meta.env.DEV) throw new Error("Demo sign-in is available only in development.");

  const accounts = {
    admin: { sub: "local-demo-admin", email: "phuonglhk@gmail.com", name: "Demo Admin" },
    student: { sub: "local-demo-student-linh", email: "linh.nguyen@example.test", name: "Nguyễn Minh Linh" },
  };
  const account = accounts[role];
  if (!account) throw new Error("Unknown demo role.");

  const provider = GoogleAuthProvider.credential(JSON.stringify({ ...account, email_verified: true }));
  const { user } = await signInWithCredential(auth, provider);
  return user;
}

export const signOutUser = () => signOut(auth);

export const onUserChange = cb => onAuthStateChanged(auth, cb);

export function watchRegistrations(onData, onError) {
  const q = query(registrations, orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
}

// --- Đăng ký lịch học: students, schedule/config, schedule/classes, availability ---

const rows = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));

export const watchCollection = (name, onData, onError) => onSnapshot(collection(db, name), snap => onData(rows(snap)), onError);

export const watchAttendanceCurrent = (onData, onError) =>
  onSnapshot(doc(db, "attendance/current"), snap => onData(snap.exists() ? snap.data() : null), onError);

export const watchAttendanceRecord = (id, onData, onError) =>
  onSnapshot(doc(db, "attendanceRecords", id), snap => onData(snap.exists() ? { id, ...snap.data() } : null), onError);

export const watchAttendanceSessions = (onData, onError) =>
  onSnapshot(query(collection(db, "attendanceSessions"), orderBy("startedAt", "desc")), snap => onData(rows(snap)), onError);

export const watchClassAttendanceSessions = (classId, onData, onError) =>
  onSnapshot(query(collection(db, "attendanceSessions"), where("classId", "==", classId)), snap => onData(rows(snap)), onError);

export const watchStudentAttendanceRecords = (classId, email, onData, onError) =>
  onSnapshot(query(collection(db, "attendanceRecords"), where("classId", "==", classId), where("studentEmail", "==", email)), snap => onData(rows(snap)), onError);

export const watchAttendanceRecords = (sessionId, onData, onError) =>
  onSnapshot(query(collection(db, "attendanceRecords"), where("sessionId", "==", sessionId)), snap => onData(rows(snap)), onError);

export const watchDocument = (path, onData, onError) => onSnapshot(doc(db, path), snap => onData(snap.exists() ? snap.data() : null), onError);

export async function readDocument(path) {
  const snap = await getDoc(doc(db, path));
  return snap.exists() ? snap.data() : null;
}

// Ghi đè cả document, kèm updatedAt theo giờ server (rules của availability bắt buộc trường này)
export const saveDocument = (path, data) => setDoc(doc(db, path), { ...data, updatedAt: serverTimestamp() });

export const saveAttendanceDocument = (path, data) => setDoc(doc(db, path), { ...data, updatedAt: serverTimestamp() }, { merge: true });

export const replaceAttendanceDocument = (path, data) => setDoc(doc(db, path), { ...data, updatedAt: serverTimestamp() });

export const saveAttendanceRecord = (id, data) => setDoc(doc(db, "attendanceRecords", id), { ...data, attemptCount: 1, submittedAt: serverTimestamp() });

export const reviewAttendanceRecord = (id, data) => updateDoc(doc(db, "attendanceRecords", id), { ...data, reviewedAt: serverTimestamp() });

export const grantAttendanceRetry = (id, data) => updateDoc(doc(db, "attendanceRecords", id), { ...data, retryAllowedAt: serverTimestamp() });

export const retryAttendanceRecord = (id, data) => updateDoc(doc(db, "attendanceRecords", id), { ...data, submittedAt: serverTimestamp() });

export const attendanceExpiry = (milliseconds) => Timestamp.fromMillis(milliseconds);

// Sinh viên chỉ được sửa đúng trường studentId, và chỉ khi đang trống (xem firestore.rules)
// Sinh viên tự kiểm tra và sửa thông tin của mình; infoConfirmedAt đánh dấu đã kiểm tra
export const updateStudentInfo = (email, info) => updateDoc(doc(db, "students", email), { ...info, infoConfirmedAt: serverTimestamp() });

// ops: [{ path, data }], data = null là xoá. Chia lô vì một batch tối đa 500 thao tác.
export async function writeDocuments(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach(({ path, data }) => {
      // merge: giữ các trường admin không gửi lên, vd. infoConfirmedAt của sinh viên
      if (data) batch.set(doc(db, path), { ...data, updatedAt: serverTimestamp() }, { merge: true });
      else batch.delete(doc(db, path));
    });
    await batch.commit();
  }
}
