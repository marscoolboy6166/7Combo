import type { Metadata } from "next";
import Header from "@/components/header";
import AdminFab from "@/components/admin-fab";
import BanWatcher from "@/components/ban-watcher";
import SetupNotice from "@/components/setup-notice";
import RoleChangeNotice from "@/components/role-change-notice";
import { CityProvider } from "@/lib/city-context";
import { getSelectedCity } from "@/lib/get-city";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import Link from "next/link";
import { APP_NAME, APP_TAGLINE, SITE_EMAIL } from "@/lib/constants";
import "./globals.css";

function resolveSiteUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const fallback = "http://localhost:3000";
  try {
    return new URL(raw ? raw : fallback);
  } catch {
    // An invalid or empty env value must never break the build.
    return new URL(fallback);
  }
}

export const metadata: Metadata = {
  metadataBase: resolveSiteUrl(),
  title: {
    default: `${APP_NAME} — ${APP_TAGLINE}`,
    template: `%s · ${APP_NAME}`,
  },
  description:
    "Discover and share 7-Eleven Thailand product combos: real products, real city availability, community-rated hacks.",
  openGraph: {
    type: "website",
    siteName: APP_NAME,
  },
  twitter: { card: "summary_large_image" },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const city = await getSelectedCity();

  // Popup for a staff role granted in the last 24h. The RPC only returns a
  // row while the logged change still matches the current role, and the
  // client keeps it one-time via localStorage.
  let recentChange: { event_type: string; p_role: string; changed_at: string } | null = null;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data: authUser } = await supabase.auth.getUser();
    if (authUser.user) {
      const { error, data } = await supabase.rpc("my_recent_role_changes");
      const last = (data ?? [])[0] as
        | { event_type: string; role: string; changed_at: string }
        | undefined;
      if (!error && last) {
        recentChange = { event_type: last.event_type, p_role: last.role, changed_at: last.changed_at };
      }
    }
  }

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <CityProvider city={city}>
          <SetupNotice />
          <BanWatcher />
          <Header />
          <AdminFab />
          <div className="flex-1">{children}</div>
          <footer className="border-t border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-slate-500 sm:flex-row">
              <p>
                🏪 <span className="font-semibold text-slate-700">{APP_NAME}</span> — {APP_TAGLINE}{" "}
                <span className="text-slate-400">An unofficial fan project. Not affiliated with 7-Eleven.</span>
              </p>
              <nav className="flex items-center gap-4" aria-label="Footer">
                <Link href="/faq" className="hover:text-emerald-700 hover:underline">
                  FAQ
                </Link>
                <Link href="/report" className="hover:text-emerald-700 hover:underline">
                  Report a bug
                </Link>
                <a href={`mailto:${SITE_EMAIL}`} className="hover:text-emerald-700 hover:underline">
                  Contact
                </a>
              </nav>
            </div>
            <p className="pb-5 text-center text-xs text-slate-400">
              Made with 🇹🇭 in Chiang Mai
            </p>
          </footer>
          <RoleChangeNotice recentChange={recentChange} />
        </CityProvider>
      </body>
    </html>
  );
}
