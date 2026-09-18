"use client";

import { useEffect, useState } from "react";
import BannedNotice from "@/components/banned-notice";

/**
 * On the profile page: if the VIEWER is banned, show their notice + the
 * one-appeal form (scope 'both' covers everything). Silent otherwise.
 */
export default function MyBanStatus() {
  const [scope, setScope] = useState<"posting" | "rating" | "both" | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/me/ban")
      .then((r) => r.json())
      .then((b) => setScope(b.banned ? b.scope ?? "both" : null))
      .catch(() => setScope(null))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || !scope) return null;
  return (
    <div className="mt-4">
      <BannedNotice />
    </div>
  );
}
