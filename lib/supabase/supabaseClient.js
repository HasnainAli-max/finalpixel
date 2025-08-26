// import { createClient } from "@supabase/supabase-js";

// const supabaseUrl = "https://hyqobpsvtzebeysgscjg.supabase.co"
// const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cW9icHN2dHplYmV5c2dzY2pnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjk5ODUsImV4cCI6MjA3MDc0NTk4NX0.5rKvfzYojyOH7buzAKYlN75oP7sEc9zW5mvX0kWmLiA"
// export const supabase = createClient(supabaseUrl, supabaseKey);






// lib/supabase/client.js
// lib/supabase/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
