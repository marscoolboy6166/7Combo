"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cn } from "@/lib/utils";

const RESERVED = new Set([
  "admin", "api", "settings", "profile", "u", "login", "submit", "combos", "products",
]);

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
const AVATAR_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export default function SettingsPage() {
  const [state, setState] = useState<"loading" | "signed-out" | "ready">("loading");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const ranRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    if (!isSupabaseConfigured()) return;

    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        setState("signed-out");
        return;
      }
      setEmail(data.user.email ?? "");
      setUserId(data.user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, username, avatar_url")
        .eq("id", data.user.id)
        .maybeSingle();
      setDisplayName(profile?.display_name ?? "");
      setUsername(profile?.username ?? "");
      setAvatarUrl(profile?.avatar_url ?? null);
      setState("ready");
    });
  }, []);

  async function uploadAvatar(file: File) {
    setAvatarMsg(null);
    if (file.size === 0 || file.size > MAX_AVATAR_BYTES) {
      setAvatarMsg("Image must be under 2 MB.");
      return;
    }
    const ext = AVATAR_TYPES[file.type];
    if (!ext) {
      setAvatarMsg("Use JPG, PNG, WebP, or GIF.");
      return;
    }

    setAvatarBusy(true);
    try {
      const supabase = createClient();
      const path = `${userId}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type, upsert: true });

      if (uploadError) {
        setAvatarMsg(
          uploadError.message.includes("row-level") || uploadError.message.includes("permission")
            ? "Upload blocked — the avatars bucket/policies aren't set up yet (run the SQL from the chat)."
            : uploadError.message,
        );
        return;
      }

      // Cache-bust so the new picture shows immediately everywhere
      const { data: publicUrl } = supabase.storage.from("avatars").getPublicUrl(path);
      const freshUrl = `${publicUrl.publicUrl}?v=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: freshUrl })
        .eq("id", userId);

      if (updateError) {
        setAvatarMsg(updateError.message);
        return;
      }

      setAvatarUrl(freshUrl);
      setAvatarMsg("Avatar updated ✓");
      router.refresh();
    } finally {
      setAvatarBusy(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  async function removeAvatar() {
    setAvatarMsg(null);
    setAvatarBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", userId);
      if (error) {
        setAvatarMsg(error.message);
        return;
      }
      setAvatarUrl(null);
      setAvatarMsg("Avatar removed — chef emoji it is ✓");
      router.refresh();
    } finally {
      setAvatarBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const handle = username.trim().toLowerCase();
    if (!USERNAME_RE.test(handle)) {
      setMessage({
        kind: "err",
        text: "Username must be 3-24 characters: lowercase letters, numbers, underscores.",
      });
      return;
    }
    if (RESERVED.has(handle)) {
      setMessage({ kind: "err", text: `“${handle}” is reserved — pick another.` });
      return;
    }
    const name = displayName.trim();
    if (name.length < 2 || name.length > 40) {
      setMessage({ kind: "err", text: "Display name must be 2-40 characters." });
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setState("signed-out");
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: name,
          username: handle,
        })
        .eq("id", userData.user.id);

      if (error) {
        const taken =
          error.code === "23505" || (error.message ?? "").toLowerCase().includes("duplicate");
        setMessage({
          kind: "err",
          text: taken ? "That username is already taken." : error.message,
        });
        return;
      }

      setMessage({ kind: "ok", text: "Saved ✓" });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-sm text-amber-800">
          <p className="text-3xl">🛠️</p>
          <h1 className="mt-2 text-lg font-bold">Supabase is not connected yet</h1>
          <p className="mt-2">Follow the setup steps in README.md, then reload this page.</p>
        </div>
      </main>
    );
  }

  if (state === "loading") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-slate-500">
        Loading settings…
      </main>
    );
  }

  if (state === "signed-out") {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
          <span className="text-5xl">⚙️</span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Sign in to change settings</h1>
          <p className="mt-2 text-sm text-slate-500">
            Your display name, username, and avatar live with your account.
          </p>
          <Link
            href="/login?next=/settings"
            className="mt-6 inline-block rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-slate-500">
        How you appear across 7Combo — on your profile and next to your combos.
      </p>

      {/* Avatar */}
      <section className="mt-6 flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className="h-20 w-20 shrink-0 rounded-full border border-slate-200 object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-amber-100 text-3xl">
            🧑‍🍳
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={avatarBusy}
              onClick={() => avatarInputRef.current?.click()}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {avatarBusy ? "Working…" : avatarUrl ? "Change photo" : "Upload photo"}
            </button>
            {avatarUrl && (
              <button
                type="button"
                disabled={avatarBusy}
                onClick={removeAvatar}
                className="rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-xs text-slate-400">JPG / PNG / WebP / GIF, up to 2 MB.</p>
          {avatarMsg && (
            <p className={cn("text-xs", avatarMsg.includes("✓") ? "text-emerald-700" : "text-red-600")}>
              {avatarMsg}
            </p>
          )}
        </div>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadAvatar(f);
          }}
        />
      </section>

      <form onSubmit={save} className="mt-4 flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="text-sm font-medium text-slate-600">
          Display name
          <input
            required
            minLength={2}
            maxLength={40}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          <span className="mt-1 block text-xs text-slate-400">2-40 characters, shown next to your combos.</span>
        </label>

        <label className="text-sm font-medium text-slate-600">
          Username
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm text-slate-400">@</span>
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <span className="mt-1 block text-xs text-slate-400">
            3-24 characters: a-z, 0-9, underscore. Your page lives at <code>/u/{username || "…"}</code>.
          </span>
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {message && (
            <span className={message.kind === "ok" ? "text-sm text-emerald-700" : "text-sm text-red-600"}>
              {message.text}
            </span>
          )}
        </div>
      </form>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Account</h2>
        <dl className="mt-3 flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Sign-in email</dt>
            <dd className="truncate font-medium text-slate-800">{email || "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Sign-in method</dt>
            <dd className="font-medium text-slate-800">Google</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Password / email changes</dt>
            <dd className="text-slate-400">via Google account settings</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
