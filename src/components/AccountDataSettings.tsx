"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetch, userMessage } from "@/lib/api-client";

// The Account tab's "Your data" section: download everything as JSON, and
// delete the account. Deleting is two steps on purpose: open the form, then
// choose what happens to your posts and confirm with your password.

type DeletionMode = "remove_everything" | "leave_posts";

const CHOICES: { mode: DeletionMode; title: string; detail: string }[] = [
  {
    mode: "leave_posts",
    title: "Leave my posts and comments up",
    detail:
      'They stay where they are, signed "A former member", so conversations you were part of still make sense. Everything else is deleted.',
  },
  {
    mode: "remove_everything",
    title: "Remove everything",
    detail:
      "Your posts, the photos and videos in them, and your comments are deleted too, along with everyone's replies on your posts.",
  },
];

const inputClass =
  "w-full rounded-xl border border-line px-4 py-2.5 text-sm text-ink placeholder-ink-faint focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400";

function DownloadData() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setError("");
    try {
      const data = await apiFetch<unknown>("/api/auth/account/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `our-place-${user?.username ?? "me"}-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(userMessage(err, "Failed to download your data."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-ink-secondary">Download my data</p>
        <p className="text-sm text-ink-faint">
          A file with your profile, posts, comments, letters, gatherings, friends, and world.
        </p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="shrink-0 rounded-lg bg-accent-50 px-3 py-1.5 text-sm font-medium text-accent-600 hover:bg-accent-100 disabled:opacity-50"
      >
        {busy ? "Gathering..." : "Download"}
      </button>
    </div>
  );
}

function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DeletionMode | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!mode) {
      setError("Choose what happens to your posts and comments.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/auth/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: password, mode }),
      });
      // Hard navigation, like logging out: a full load drops every piece of
      // signed-in client state.
      window.location.assign(new URL("/goodbye", window.location.origin).href);
    } catch (err) {
      setError(userMessage(err, "Failed to delete your account."));
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ink-secondary">Delete my account</p>
          <p className="text-sm text-ink-faint">
            Signs you out everywhere and removes your account for good.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Delete...
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-red-400 p-4">
      <p className="text-sm font-semibold text-ink">Delete my account</p>
      <p className="mt-1 text-sm text-ink-muted">
        Either way, your profile, island, letters you hold, friends, gatherings you host, and
        everything in your world are deleted, and gatherings you&apos;re hosting are cancelled with
        a notice to everyone going. Letters you sent stay with the people you sent them to. This
        can&apos;t be undone.
      </p>
      <fieldset className="mt-4 space-y-2">
        <legend className="text-sm font-medium text-ink-secondary">
          What happens to your posts and comments?
        </legend>
        {CHOICES.map((choice) => (
          <label
            key={choice.mode}
            className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${
              mode === choice.mode ? "border-red-400 bg-surface-emphasis" : "border-line"
            }`}
          >
            <input
              type="radio"
              name="deletion-mode"
              value={choice.mode}
              checked={mode === choice.mode}
              onChange={() => setMode(choice.mode)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium text-ink">{choice.title}</span>
              <span className="block text-sm text-ink-muted">{choice.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="mt-4 block text-sm font-medium text-ink-secondary">
        Your password
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={`mt-1.5 ${inputClass}`}
        />
      </label>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || !mode || !password}
          className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? "Deleting..." : "Delete my account"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setMode(null);
            setPassword("");
            setError("");
          }}
          className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-ink-secondary hover:bg-surface-muted"
        >
          Keep my account
        </button>
      </div>
    </form>
  );
}

/** "Your data": download, then delete. Admin accounts can&apos;t be deleted here. */
export default function AccountDataSettings() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="space-y-4 py-2">
      <DownloadData />
      {user.role === "admin" ? (
        <div>
          <p className="text-sm font-medium text-ink-secondary">Delete my account</p>
          <p className="text-sm text-ink-faint">
            Admin accounts can&apos;t be deleted here, so the place always has someone to look after
            it. Ask Luke if this account needs to go.
          </p>
        </div>
      ) : (
        <DeleteAccount />
      )}
    </div>
  );
}
