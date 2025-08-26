// lib/supabase/server.js
import { createClient } from '@supabase/supabase-js';

let _admin = null;
let _bucket = null;

export function getSupabaseAdmin() {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const serviceRole = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const rawBucket =
    process.env.SUPABASE_BUCKET ||
    process.env.NEXT_PUBLIC_SUPABASE_BUCKET ||
    'avatars';
  const AVATAR_BUCKET = rawBucket.trim();

  if (!supabaseUrl || !serviceRole) {
    const err = new Error(
      'Supabase server envs missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local'
    );
    err.code = 'MISSING_SUPABASE_ENVS';
    throw err;
  }

  if (!_admin) {
    _admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  _bucket = AVATAR_BUCKET;

  return { supabaseAdmin: _admin, AVATAR_BUCKET: _bucket };
}

/** Ensure bucket exists; create it (private) if missing. */
export async function ensureBucket(name) {
  const { supabaseAdmin } = getSupabaseAdmin();
  const bucket = name || _bucket;

  // Try to fetch bucket; if not found, create it
  const { data, error } = await supabaseAdmin.storage.getBucket(bucket);
  if (error && !/not found/i.test(error.message)) throw error;
  if (!data) {
    const { error: cErr } = await supabaseAdmin.storage.createBucket(bucket, {
      public: false,
      fileSizeLimit: '10MB',
      allowedMimeTypes: ['image/jpeg','image/png','image/webp'],
    });
    if (cErr && !/already exists/i.test(cErr.message)) throw cErr;
  }
  return bucket;
}
