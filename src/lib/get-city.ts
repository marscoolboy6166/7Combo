import { cookies } from "next/headers";
import { DEFAULT_CITY } from "@/lib/constants";
import { CITY_COOKIE } from "@/components/city-select";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * City resolution order: device cookie → account default (profiles.
 * default_city) → site default. The DB is only touched when the visitor
 * has no cookie yet (typically: signed in on a fresh browser).
 */
export async function getSelectedCity(): Promise<string> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(CITY_COOKIE)?.value;
  if (fromCookie) return fromCookie;

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("default_city")
          .eq("id", data.user.id)
          .maybeSingle();
        if (profile?.default_city) return profile.default_city;
      }
    } catch {
      // Degrade to the site default — never block a render on this.
    }
  }

  return DEFAULT_CITY;
}
