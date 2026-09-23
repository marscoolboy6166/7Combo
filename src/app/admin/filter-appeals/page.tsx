"use client";

import FilterAppealsAdmin from "@/components/filter-appeals-admin";

/**
 * Admin → Filter appeals: the user-facing friendly-content filter can
 * produce false positives; this is where staff review user appeals,
 * approve or reject them, and manage the phrase whitelist.
 */
export default function AdminFilterAppealsPage() {
  return (
    <main>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-bold tracking-tight">Filter appeals</h2>
        <span className="text-sm text-slate-500">
          Contest filter rejections and manage the phrase whitelist.
        </span>
      </div>
      <FilterAppealsAdmin />
    </main>
  );
}
