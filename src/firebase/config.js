// ─────────────────────────────────────────────────────
//  Firebase Configuration (sihnav-59c8f)
// ─────────────────────────────────────────────────────
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDUxvuv7fj62zq4heTl-XcJmPlRAEG8VnY",
  authDomain: "sihnav-59c8f.firebaseapp.com",
  projectId: "sihnav-59c8f",
  storageBucket: "sihnav-59c8f.firebasestorage.app",
  messagingSenderId: "283471598055",
  appId: "1:283471598055:web:2d9d206f84012ab820ad42"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
