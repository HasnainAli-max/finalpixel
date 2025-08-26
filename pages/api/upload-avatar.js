// pages/api/upload-avatar.js
export const config = { api: { bodyParser: false } };
export const runtime = 'nodejs';

import formidable from 'formidable';
import { getSupabaseAdmin, ensureBucket } from '@/lib/supabase/server';
import { authAdmin, db, FieldValue } from '@/lib/firebase/firebaseAdmin';
import fs from 'fs';

function parseForm(req) {
  const form = formidable({ multiples: false, maxFileSize: 10 * 1024 * 1024 });
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => (err ? reject(err) : resolve({ fields, files })));
  });
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return res.status(401).json({ error: 'Unauthorized. Token missing.' });

    let decoded;
    try { decoded = await authAdmin.verifyIdToken(idToken, true); }
    catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
    const uid = decoded.uid;

    let supabaseAdmin, AVATAR_BUCKET;
    ({ supabaseAdmin, AVATAR_BUCKET } = getSupabaseAdmin());

    // Ensure bucket exists (no-op if it already exists)
    await ensureBucket(AVATAR_BUCKET);

    const { files } = await parseForm(req);
    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded (field name must be "file")' });

    const mime = file.mimetype || 'application/octet-stream';
    const ext = (file.originalFilename || '').split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const buffer = fs.readFileSync(file.filepath);

    const { error: upErr } = await supabaseAdmin.storage
      .from(AVATAR_BUCKET)
      .upload(path, buffer, { contentType: mime, upsert: true });

    if (upErr) {
      if (/bucket/i.test(upErr.message)) {
        return res.status(400).json({ error: `Supabase bucket "${AVATAR_BUCKET}" not found.` });
      }
      return res.status(500).json({ error: `Upload failed: ${upErr.message || upErr}` });
    }

    // Private bucket → create signed URL (1 year). If your bucket is public,
    // you could switch to getPublicUrl instead.
    const { data: signed, error: sErr } = await supabaseAdmin
      .storage.from(AVATAR_BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year

    if (sErr) return res.status(500).json({ error: `URL generation failed: ${sErr.message}` });

    const photoURL = signed?.signedUrl || null;
    if (!photoURL) return res.status(500).json({ error: 'Upload succeeded but URL could not be created.' });

    // ---- NEW: Update Firebase Auth user's photoURL (server-side)
    try {
      await authAdmin.updateUser(uid, { photoURL });
    } catch (e) {
      // not fatal for client; log but continue
      console.error("[upload-avatar] admin updateUser failed:", e);
    }

    // ---- NEW: Update Firestore user doc with photoURL + avatarPath
    try {
      await db.collection('users').doc(uid).set(
        { photoURL, avatarPath: path, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    } catch (e) {
      console.error("[upload-avatar] Firestore set failed:", e);
      // still return success to client (client will also upsert)
    }

    return res.status(200).json({ photoURL, avatarPath: path });
  } catch (e) {
    console.error('[upload-avatar] error', e);
    res.status(500).json({ error: e.message || 'Unexpected server error' });
  }
}
