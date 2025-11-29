// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDH4AtKQTNVrsQqYWfjDY2PdAWzQs5fz5s",
  authDomain: "dreamart-14082.firebaseapp.com",
  projectId: "dreamart-14082",
  storageBucket: "dreamart-14082.firebasestorage.app",
  messagingSenderId: "465902572866",
  appId: "1:465902572866:web:9eb52fa95a5b702d92a4db",
  measurementId: "G-SL80P9772E"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
let analytics;

if (typeof window !== 'undefined') {
  analytics = getAnalytics(app);
}

export { app, auth, db, storage, analytics };
