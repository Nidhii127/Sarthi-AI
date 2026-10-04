/**
 * lib/firebase.ts — Browser/Client Firebase SDK singleton
 *
 * Safe to import in Client Components and browser-executed code only.
 * All credentials here are NEXT_PUBLIC_* — intentionally exposed to the browser.
 *
 * Exports:
 *   app       — Firebase App instance
 *   auth      — Firebase Auth instance
 *   db        — Firestore instance
 *   storage   — Firebase Storage instance (initialized; uploads not implemented yet)
 *
 * Usage:
 *   import { auth, db } from "@/lib/firebase";
 *
 * DO NOT import firebase-admin or any FIREBASE_ADMIN_* env var here.
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

// Prevent re-initializing the app on hot reload in development
const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);
const storage: FirebaseStorage = getStorage(app);

export { app, auth, db, storage };
