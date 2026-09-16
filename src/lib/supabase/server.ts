import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isSupabaseConfigured, NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/config";

/**
 * Server-side Supabase client for Server Components, Route Handlers
 * and Server Actions. Reads the auth session from cookies.
 */
export async function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error(NOT_CONFIGURED_MESSAGE);
  }

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — can be ignored: the proxy
            // refreshes sessions before user interaction happens.
          }
        },
      },
    },
  );
}
