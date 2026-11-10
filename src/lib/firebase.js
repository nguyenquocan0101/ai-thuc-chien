import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, doc, setDoc, query, orderBy, onSnapshot, serverTimestamp } from "firebase/firestore";
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

// The form needs no sign-in: one document per email, keyed by the lowercased address.
// Submitting the same email again counts as an update, which the rules deny (permission-denied).
export async function submitRegistration({ name, email, studentId, major, term, lang }) {
  await setDoc(doc(registrations, email), { name, email, studentId, major, term, pledge: true, lang, createdAt: serverTimestamp() });
}

export function watchRegistrations(onData, onError) {
  const q = query(registrations, orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
}
