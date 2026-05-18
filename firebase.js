import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  collection,
  addDoc,
  query,
  orderBy,
  serverTimestamp,
  deleteDoc,
  writeBatch,
  arrayUnion,
  arrayRemove,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// PASTE YOUR FIREBASE WEB CONFIG OBJECT BELOW.
// Get it from Firebase Console → Project settings → Your apps → SDK setup.
const firebaseConfig = {
  apiKey: "AIzaSyC2UyPWtxXnEfsMHNDiwi-3FtwP5ALIcIc",
  authDomain: "hangmangle.firebaseapp.com",
  projectId: "hangmangle",
  storageBucket: "hangmangle.firebasestorage.app",
  messagingSenderId: "692745949835",
  appId: "1:692745949835:web:4b43a734d34edfbf98ba8e",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export function signIn() {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          unsub();
          resolve(user);
        }
      },
      reject
    );
    signInAnonymously(auth).catch(reject);
  });
}

export {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  collection,
  addDoc,
  query,
  orderBy,
  serverTimestamp,
  deleteDoc,
  writeBatch,
  arrayUnion,
  arrayRemove,
};
