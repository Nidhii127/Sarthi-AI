/**
 * lib/firebase-admin.ts — Server-side Firebase Admin SDK singleton
 *
 * NEVER import this file in Client Components, pages marked "use client",
 * or any code that runs in the browser. It holds private service account
 * credentials that must not be exposed to the client.
 *
 * Safe to import in:
 *   - Next.js API Route Handlers (app/api/**)
 *   - Server Components
 *   - Server Actions ("use server")
 *   - middleware.ts
 *   - scripts/** (Node.js)
 *
 * Exports:
 *   adminApp   — Firebase Admin App instance
 *   adminAuth  — Admin Auth (verifyIdToken, verifySessionCookie, etc.)
 *   adminDb    — Admin Firestore (server-side reads/writes)
 *
 * Environment variables required (server-side only, never NEXT_PUBLIC_*):
 *   FIREBASE_ADMIN_PROJECT_ID
 *   FIREBASE_ADMIN_CLIENT_EMAIL
 *   FIREBASE_ADMIN_PRIVATE_KEY   — note: newlines are \n in .env.local
 */

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function createAdminApp(): App {
  // Reuse existing app on hot reload (avoids "already exists" error in dev)
  const existingApps = getApps();
  if (existingApps.length > 0) {
    return existingApps[0];
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "[firebase-admin] Missing required environment variables: " +
        "FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY. " +
        "These must be set in .env.local (server-side only)."
    );
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      // .env.local stores literal \n — replace with real newlines
      privateKey: privateKey.replace(/\\n/g, "\n"),
    }),
  });
}

const adminApp: App = createAdminApp();
const adminAuth: Auth = getAuth(adminApp);
const adminDb: Firestore = getFirestore(adminApp);

export { adminApp, adminAuth, adminDb };
