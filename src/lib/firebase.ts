// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBe5kWblTFFDmNRyjnQjEiL7P_Nk2lJzj8",
  authDomain: "dalenzia-a6175.firebaseapp.com",
  projectId: "dalenzia-a6175",
  storageBucket: "dalenzia-a6175.firebasestorage.app",
  messagingSenderId: "707927135546",
  appId: "1:707927135546:web:0792175d7791e5eb34ac03",
  measurementId: "G-Z0PTE2ZGC4"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
let analytics;
if (typeof window !== "undefined") {
    analytics = getAnalytics(app);
}

export { app, auth, db, storage, analytics };