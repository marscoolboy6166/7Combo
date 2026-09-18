"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured, NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/config";
import { APP_NAME } from "@/lib/constants";

function LoginInner() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Error passed back by the auth callback (real OAuth failure reason).
  const callbackError = searchParams.get("error");
  const callbackReason = searchParams.get("reason");
  const shownError =
    callbackError === "auth"
      ? callbackReason
        ? `Sign-in failed: ${callbackReason}`
        : "Sign-in failed. Please try again."
      : callbackError === "setup"
        ? NOT_CONFIGURED_MESSAGE
        : null;

  async function signInWithGoogle() {
    if (!isSupabaseConfigured()) {
      setError(NOT_CONFIGURED_MESSAGE);
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Always show Google's account chooser so you can switch or add
        // accounts (needed for testing multiple users on localhost).
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
    // On success the browser redirects to Google.
  }

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col items-center justify-center px-4 py-12">
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-3xl">
            🏪
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Sign in to {APP_NAME}</h1>
          <p className="mt-2 text-sm text-slate-500">
            Post your own combos, rate others, and keep your favorites coming.
          </p>
        </div>

        {(error ?? shownError) && (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error ?? shownError}
          </p>
        )}

        <button
          onClick={signInWithGoogle}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
            <path
              fill="#4285F4"
              d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.2h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.02.15 3.5 2.7.24.02c2.2-2.05 3.5-5.05 3.5-8.7z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5l-.14.01-3.6 2.8-.05.13C3.4 21.3 7.4 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.2 14.4c-.25-.74-.4-1.53-.4-2.4s.14-1.66.4-2.4l-.01-.16-3.65-2.83-.12.06C.5 8.2 0 10 0 12s.5 3.8 1.4 5.3l3.8-2.9z"
            />
            <path
              fill="#EB4335"
              d="M12 4.6c2.2 0 3.7.95 4.6 1.75l3.35-3.27C17.9 1.15 15.2 0 12 0 7.4 0 3.4 2.7 1.4 6.7l3.8 2.9c1-2.9 3.7-5 6.8-5z"
            />
          </svg>
          {loading ? "Redirecting…" : "Continue with Google"}
        </button>

        <p className="mt-6 text-center text-xs text-slate-400">
          New here? Signing in also works if you have never posted before.
        </p>
        <p className="mt-2 text-center text-xs">
          <Link href="/" className="text-emerald-700 hover:underline">
            ← Back to browsing
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
