// lib/firebase/firebaseAdmin.js
import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// ---- Hard disable gRPC (prevents proto-loader/grpc issues in dev)
process.env.GOOGLE_CLOUD_DISABLE_GRPC = process.env.GOOGLE_CLOUD_DISABLE_GRPC || "1";

// ---- Project Id defaults
const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  "pixelproof-18a84";

if (!process.env.GOOGLE_CLOUD_PROJECT) process.env.GOOGLE_CLOUD_PROJECT = PROJECT_ID;
if (!process.env.GCLOUD_PROJECT) process.env.GCLOUD_PROJECT = PROJECT_ID;

// ---- Prefer localhost for emulators (avoid odd socket issues on 127.0.0.1)
for (const key of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) {
  const v = process.env[key];
  if (v && v.startsWith("127.0.0.1:")) process.env[key] = v.replace("127.0.0.1", "localhost");
}

// ---- Fill emulator defaults in dev
if (process.env.NODE_ENV !== "production") {
  if (!process.env.FIRESTORE_EMULATOR_HOST) process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";
}

const isEmu =
  !!process.env.FIREBASE_AUTH_EMULATOR_HOST || !!process.env.FIRESTORE_EMULATOR_HOST;

let app;
if (!getApps().length) {
  if (isEmu) {
    // Emulator: no credentials required
    app = initializeApp({ projectId: PROJECT_ID });
  } else {
    const serviceAccount = {
      projectId: PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/^"|"$/g, "").replace(/\\n/g, "\n")
        : undefined,
    };
    app = initializeApp({
      credential:
        serviceAccount.clientEmail && serviceAccount.privateKey
          ? cert(serviceAccount)
          : undefined,
      projectId: PROJECT_ID,
    });
  }
} else {
  app = getApp();
}

export const authAdmin = getAuth(app);

// NOTE:
// Do NOT import 'firebase-admin/firestore' here.
// If/when you need Firestore Admin, import from './firebaseAdminDb' (below).
