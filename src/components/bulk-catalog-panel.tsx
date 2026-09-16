"use client";

import { useRef, useState } from "react";
import { TEMPLATE_CSV } from "@/lib/csv";
import { categoryLabel } from "@/lib/constants";

interface BulkRowResult {
  rowNumber: number;
  slug: string;
  name_en: string;
  category: string;
  price_thb: number;
  cities: string[];
  status: "ok" | "warning" | "error";
  messages: string[];
  exists?: boolean;
}

interface BulkResponse {
  mode?: string;
  totalRows?: number;
  toUpsert?: number;
  newCount?: number;
  updateCount?: number;
  toHide?: number;
  upserted?: number;
  hidden?: number;
  errorCount?: number;
  warningCount?: number;
  results?: BulkRowResult[];
  message?: string;
}

function downloadTemplate() {
  const blob = new Blob(["\ufeff" + TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "7combo-catalog-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function BulkCatalogPanel({ onImported }: { onImported: () => void }) {
  const [csv, setCsv] = useState("");
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<BulkResponse | null>(null);
  const [result, setResult] = useState<BulkResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function readFile(file: File) {
    const text = await file.text();
    setCsv(text);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  async function callApi(mode: "dry" | "commit") {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, mode, importMode }),
      });
      const data: BulkResponse = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Import failed.");
        setPreview(null);
        return;
      }
      if (mode === "dry") {
        setPreview(data);
      } else {
        setResult(data);
        setPreview(null);
        setCsv("");
        if (fileRef.current) fileRef.current.value = "";
        onImported();
      }
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-bold tracking-tight">📊 Bulk catalog import / export</h2>
        <p className="text-xs text-slate-400">
          Maintain the catalog in a spreadsheet, then push it here.
        </p>
      </div>

      {/* Export / template row */}
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <a
          href="/api/admin/products/bulk"
          className="rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50"
        >
          ⬇️ Export catalog as CSV
        </a>
        <button
          type="button"
          onClick={downloadTemplate}
          className="rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-700 transition hover:bg-slate-50"
        >
          📄 Download blank template
        </button>
        <span className="text-xs text-slate-400">
          Export → edit in Excel/Sheets → import back. Best workflow.
        </span>
      </div>

      {/* Input */}
      <div className="mt-5">
        <label className="text-sm font-medium text-slate-600">
          Paste CSV / TSV data (or pick a file — .csv, .tsv, or .txt)
          <textarea
            rows={5}
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setPreview(null);
              setResult(null);
            }}
            placeholder={"name_en,category,price_thb\nMama Pork Noodles,instant-noodles,16"}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs focus:border-emerald-500 focus:outline-none"
          />
        </label>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/plain"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void readFile(f);
          }}
          className="mt-2 block w-full cursor-pointer rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-emerald-700"
        />
      </div>

      {/* Mode + actions */}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || !csv.trim()}
            onClick={() => void callApi("dry")}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {busy ? "Working…" : "Preview import"}
          </button>
          <button
            type="button"
            disabled={busy || !csv.trim()}
            onClick={() => void callApi("commit")}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            Import now
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={importMode === "replace"}
            onChange={(e) => {
              setImportMode(e.target.checked ? "replace" : "merge");
              setPreview(null);
            }}
            className="h-4 w-4 rounded border-slate-300"
          />
          Hide catalog items not in this file
        </label>
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* Success summary */}
      {result && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p className="font-semibold">✅ Imported {result.upserted} products</p>
          <p className="mt-0.5 text-xs">
            {result.newCount ?? 0} new · {result.updateCount ?? 0} updated
            {result.hidden ? ` · ${result.hidden} hidden (not in file)` : ""}
            {result.warningCount ? ` · ${result.warningCount} row(s) imported with warnings` : ""}
          </p>
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-700">
            Preview: {preview.toUpsert} row(s) ready
            <span className="ml-2 font-normal text-slate-500">
              {preview.newCount ?? 0} new · {preview.updateCount ?? 0} will update
              {preview.toHide ? ` · ${preview.toHide} will be hidden` : ""}
              {preview.errorCount ? ` · ${preview.errorCount} error(s)` : ""}
              {preview.warningCount ? ` · ${preview.warningCount} warning(s)` : ""}
            </span>
          </p>
          <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-xs">
              <tbody>
                {preview.results?.map((r) => (
                  <tr key={r.rowNumber} className="border-b border-slate-100 last:border-0">
                    <td className="w-10 px-2 py-1.5 text-slate-400">#{r.rowNumber}</td>
                    <td className="px-2 py-1.5 font-medium text-slate-700">{r.name_en || "—"}</td>
                    <td className="px-2 py-1.5 text-slate-500">{categoryLabel(r.category)}</td>
                    <td className="px-2 py-1.5 text-slate-500">฿{r.price_thb}</td>
                    <td className="px-2 py-1.5">
                      {r.status === "error" ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">
                          error: {r.messages[0] ?? "invalid"}
                        </span>
                      ) : r.status === "warning" ? (
                        <span
                          className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700"
                          title={r.messages.join(" · ")}
                        >
                          ⚠ {r.messages[0]}
                        </span>
                      ) : r.exists ? (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700">update</span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">
                          new
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Nothing is saved until you press <strong>Import now</strong>. Merge mode updates by
            slug; anything in the file stays untouched.
          </p>
        </div>
      )}

      {/* Column help */}
      <details className="mt-4 text-xs text-slate-500">
        <summary className="cursor-pointer font-medium text-slate-600">
          Accepted columns &amp; cheatsheet
        </summary>
        <div className="mt-2 grid gap-1 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
          <span>
            <code>name_en</code> — required. <code>name_th</code> optional.
          </span>
          <span>
            <code>slug</code> — optional, auto-generated from the name.
          </span>
          <span>
            <code>category</code> — drink, chips, candy, snack, sauce, ready-to-eat, frozen,
            instant-noodles, dessert, other
          </span>
          <span>
            <code>price_thb</code> — plain number (฿ and commas okay).
          </span>
          <span>
            <code>cities</code> — e.g. <code>bangkok|chiangmai</code> or blank for nationwide.
          </span>
          <span>
            <code>active</code> — yes/no (blank = yes). <code>emoji</code>,{" "}
            <code>image_url</code>, <code>description</code> optional.
          </span>
        </div>
      </details>
    </section>
  );
}
