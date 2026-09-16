"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PRODUCT_SORTS } from "@/lib/constants";

export default function ProductSortSelect({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    if (e.target.value === "name") params.delete("sort");
    else params.set("sort", e.target.value);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="text-slate-500">Sort by</span>
      <select
        value={value}
        onChange={onChange}
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
      >
        {PRODUCT_SORTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}
