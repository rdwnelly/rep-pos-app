// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDN81-3pL_Vgo3o9qgAqFntGze4bZ9O49c",
  authDomain: "rep-pos-app.firebaseapp.com",
  projectId: "rep-pos-app",
  storageBucket: "rep-pos-app.firebasestorage.app",
  messagingSenderId: "387307851193",
  appId: "1:387307851193:web:947e1a29e6c0fde8b0ba68",
  measurementId: "G-N1YVW5QSFX",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
// Pola Singleton untuk mencegah inisialisasi ulang aplikasi Firebase selama Hot Reloading
const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };
