// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAXEAFAgmktnkh6q99oxOBpjAwozX75XKog",
  authDomain: "festize-2111e.firebaseapp.com",
  databaseURL: "https://festize-2111e-default-rtdb.firebaseio.com",
  projectId: "festize-2111e",
  storageBucket: "festize-2111e.firebasestorage.app",
  messagingSenderId: "639630372325",
  appId: "1:639630372325:web:224209a05b7a879c08d30c",
  measurementId: "G-1E2D60PP4R"
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
