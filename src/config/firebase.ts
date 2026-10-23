import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import {
  app as defaultApp,
  db as defaultDb,
  auth as defaultAuth,
  isFirestoreQuotaExceeded,
  markFirestoreQuotaExceeded,
  resetFirestoreQuotaAndEnableNetwork,
  testFirestoreServerConnectionOnBoot
} from "../firebaseConfig";

export const firebaseConfig = {
  apiKey: (import.meta as any).env?.VITE_FIREBASE_API_KEY || "AIzaSyAazNo3xjmQAHXbjq8aC9Blqy_PSpAHTtI",
  authDomain: (import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN || "appdayhoc-dcb36.firebaseapp.com",
  projectId: (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID || "appdayhoc-dcb36",
  storageBucket: (import.meta as any).env?.VITE_FIREBASE_STORAGE_BUCKET || "appdayhoc-dcb36.firebasestorage.app",
  messagingSenderId: (import.meta as any).env?.VITE_FIREBASE_MESSAGING_SENDER_ID || "498653089335",
  appId: (import.meta as any).env?.VITE_FIREBASE_APP_ID || "1:498653089335:web:3d9453134dc6ca238379b2",
  measurementId: (import.meta as any).env?.VITE_FIREBASE_MEASUREMENT_ID || "G-JNQPGWC6F4"
};

export const app = defaultApp || (getApps().length > 0 ? getApp() : initializeApp(firebaseConfig));
export const db = defaultDb || getFirestore(app);
export const auth = defaultAuth || getAuth(app);

export {
  isFirestoreQuotaExceeded,
  markFirestoreQuotaExceeded,
  resetFirestoreQuotaAndEnableNetwork,
  testFirestoreServerConnectionOnBoot
};

export default app;
