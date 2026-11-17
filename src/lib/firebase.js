import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, connectAuthEmulator } from "firebase/auth";
import { getFirestore, collection, doc, getDoc, setDoc, updateDoc, writeBatch, query, orderBy, onSnapshot, serverTimestamp, connectFirestoreEmulator } from "firebase/firestore";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const registrations = collection(db, "registrations");

// Chạy thử không đụng dữ liệu thật: `npm run dev` rồi mở trang kèm ?emu, cần Firebase Emulator (auth 9099, firestore 8181)
if (import.meta.env.DEV && new URLSearchParams(location.search).has("emu")) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8181);
}

export async function signInWithGoogle(params = {}) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account", ...params });
  const { user } = await signInWithPopup(auth, provider);
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

export const watchDocument = (path, onData, onError) => onSnapshot(doc(db, path), snap => onData(snap.exists() ? snap.data() : null), onError);

export async function readDocument(path) {
  const snap = await getDoc(doc(db, path));
  return snap.exists() ? snap.data() : null;
}

// Ghi đè cả document, kèm updatedAt theo giờ server (rules của availability bắt buộc trường này)
export const saveDocument = (path, data) => setDoc(doc(db, path), { ...data, updatedAt: serverTimestamp() });

// Sinh viên chỉ được sửa đúng trường studentId, và chỉ khi đang trống (xem firestore.rules)
export const fillStudentId = (email, studentId) => updateDoc(doc(db, "students", email), { studentId });

// ops: [{ path, data }], data = null là xoá. Chia lô vì một batch tối đa 500 thao tác.
export async function writeDocuments(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach(({ path, data }) => {
      if (data) batch.set(doc(db, path), { ...data, updatedAt: serverTimestamp() });
      else batch.delete(doc(db, path));
    });
    await batch.commit();
  }
}
