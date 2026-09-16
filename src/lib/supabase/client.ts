import { createBrowserClient } from "@supabase/ssr";
import { isSupabaseConfigured, NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/config";

export function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error(NOT_CONFIGURED_MESSAGE);
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
