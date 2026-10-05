"use client";

import BugReportsAdmin from "@/components/bug-reports-admin";

/**
 * Admin → Bug reports: users file reports at /report;
 * this is the staff queue where they're reviewed and
 * marked resolved.
 */
export default function AdminReportsPage() {
  return (
    <main>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-bold tracking-tight">Bug reports</h2>
        <span className="text-sm text-slate-500">
          Review user-submitted bug reports and mark them resolved.
        </span>
      </div>
      <BugReportsAdmin />
    </main>
  );
}
