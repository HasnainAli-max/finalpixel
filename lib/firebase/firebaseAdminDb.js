import "./firebaseAdmin";
import { getApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

const DATABASE_ID = process.env.FIRESTORE_DB_ID || "(default)";
const db = getFirestore(getApp(), DATABASE_ID);

try { db.settings({ preferRest: true, ignoreUndefinedProperties: true }); } catch {}

export { db, FieldValue, Timestamp };
