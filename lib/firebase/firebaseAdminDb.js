// lib/firebase/firebaseAdminDb.js
// Ensure the app is initialized
import "./firebaseAdmin";
import { getApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

// If you use multi-db, keep the ID, else default is fine
const DATABASE_ID = process.env.FIRESTORE_DB_ID || "(default)";
const db = getFirestore(getApp(), DATABASE_ID);

// Prefer REST + ignore undefined (try/catch as older SDKs may ignore)
try {
  db.settings({ preferRest: true, ignoreUndefinedProperties: true });
} catch {}

export { db, FieldValue, Timestamp };
