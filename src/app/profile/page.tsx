import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getProfileById } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Redirects the signed-in user to their own public profile page. */
export default async function MyProfileRedirect() {
  if (!isSupabaseConfigured()) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) redirect("/login");

  const profile = await getProfileById(data.user.id);
  if (profile?.username) redirect(`/u/${profile.username}`);

  redirect("/combos");
}
