"use client";

import { useEffect, useState } from "react";

export default function SetupNotice() {
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => setNeedsSetup(!data.supabaseConfigured))
      .catch(() => setNeedsSetup(false));
  }, []);

  if (!needsSetup) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-sm text-amber-800">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p>
          <span className="font-semibold">Setup needed:</span> connect Supabase to
          bring this app to life. See <code>README.md</code> for the 5-minute guide.
        </p>
        <p className="text-amber-600">
          Browsing still works with the built-in demo data.
        </p>
      </div>
    </div>
  );
}
