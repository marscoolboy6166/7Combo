import type { Metadata } from "next";
import Header from "@/components/header";
import AdminFab from "@/components/admin-fab";
import SetupNotice from "@/components/setup-notice";
import { CityProvider } from "@/lib/city-context";
import { getSelectedCity } from "@/lib/get-city";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
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

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <CityProvider city={city}>
          <SetupNotice />
          <Header />
          <AdminFab />
          <div className="flex-1">{children}</div>
          <footer className="border-t border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-slate-500 sm:flex-row">
              <p>
                🏪 <span className="font-semibold text-slate-700">{APP_NAME}</span> — {APP_TAGLINE}{" "}
                <span className="text-slate-400">An unofficial fan project. Not affiliated with 7-Eleven.</span>
              </p>
              <p className="text-slate-400">Made with 🇹🇭 in Chiang Mai</p>
            </div>
          </footer>
        </CityProvider>
      </body>
    </html>
  );
}
