import { createClient } from "@supabase/supabase-js";

export function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // During Next.js build the module is evaluated server-side before env vars are
    // inlined. Return a stub so the build succeeds; the real error surfaces in the
    // browser if variables are genuinely missing at runtime.
    if (typeof window === "undefined") {
      return createClient("https://placeholder.supabase.co", "placeholder");
    }
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Add both to Vercel → Project Settings → Environment Variables.",
    );
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}
