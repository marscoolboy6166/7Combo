"use client";

import { useRouter } from "next/navigation";
import { CITIES } from "@/lib/constants";

export const CITY_COOKIE = "sevencombo_city";

export default function CitySelect({ value }: { value: string }) {
  const router = useRouter();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    document.cookie = `${CITY_COOKIE}=${e.target.value}; path=/; max-age=${60 * 60 * 24 * 365}`;
    router.refresh();
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="text-slate-500">📍 Available in</span>
      <select
        value={value}
        onChange={onChange}
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none"
      >
        {CITIES.filter((c) => c.value !== "all").map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
        <option value="all">Everywhere</option>
      </select>
    </label>
  );
}
