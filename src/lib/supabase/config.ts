/** True when the Supabase env vars are present and not left as placeholders. */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(
    url &&
      key &&
      !url.includes("YOUR-PROJECT-REF") &&
      !key.includes("YOUR-ANON-KEY"),
  );
}

export const NOT_CONFIGURED_MESSAGE =
  "Supabase is not connected yet. Follow README.md to add your project URL and anon key.";
