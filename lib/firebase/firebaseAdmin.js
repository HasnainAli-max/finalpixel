// lib/firebase/firebaseAdmin.js
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  // strip accidental surrounding quotes and restore line breaks
  privateKey: process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/^"|"$/g, '').replace(/\\n/g, '\n')
    : undefined,
};

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}

const app = getApp();

// Admin Auth for verifying ID tokens in API routes
export const authAdmin = getAuth(app);

// Explicit DB id avoids "settings.databaseId" crash in some envs
const DATABASE_ID = process.env.FIRESTORE_DB_ID || '(default)';
export const db = getFirestore(app, DATABASE_ID);

// In some dev setups, prefer REST (ignored silently if not supported)
try {
  db.settings({ preferRest: true });
} catch (_) {}

export { FieldValue, Timestamp };
