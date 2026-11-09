import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, doc, getDoc, setDoc, updateDoc, query, orderBy, onSnapshot, serverTimestamp } from "firebase/firestore";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const registrations = collection(db, "registrations");

export async function signInWithGoogle(params = {}) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account", ...params });
  const { user } = await signInWithPopup(auth, provider);
  return user;
}

export const signOutUser = () => signOut(auth);

export const onUserChange = cb => onAuthStateChanged(auth, cb);

// One document per student, keyed by Firebase uid, so re-submitting edits the same record.
export async function getRegistration(uid) {
  const snap = await getDoc(doc(registrations, uid));
  return snap.exists() ? snap.data() : null;
}

export async function saveRegistration(user, fields) {
  const ref = doc(registrations, user.uid);
  const data = {
    uid: user.uid,
    name: String(user.name || user.email).slice(0, 120),
    email: user.email,
    ...fields,
    updatedAt: serverTimestamp()
  };
  const existing = await getDoc(ref);
  if (existing.exists()) await updateDoc(ref, data);
  else await setDoc(ref, { ...data, createdAt: serverTimestamp() });
}

export function watchRegistrations(onData, onError) {
  const q = query(registrations, orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
}
