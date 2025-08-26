// lib/supabase/client.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const rawBucket = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || 'avatars';
export const AVATAR_BUCKET = rawBucket.split('#')[0].trim(); // strip accidental inline comments

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase envs: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
