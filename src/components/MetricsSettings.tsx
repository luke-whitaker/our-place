"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetch, userMessage } from "@/lib/api-client";

// The Account tab's switch for leaving the admin metrics. Saved the moment it
// changes, like the theme picker. Turning it on deletes the member's existing
// activity rows on the server; Luke's letter points members here by this label.
export default function MetricsSettings() {
  const { user, refresh } = useAuth();
  const [excluded, setExcluded] = useState(() => user?.exclude_from_metrics === true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!user) return null;

  async function toggle() {
    const next = !excluded;
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      await apiFetch("/api/auth/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exclude_from_metrics: next }),
      });
      setExcluded(next);
      setSuccess(next ? "You're out of the activity counts." : "You're back in the counts.");
      await refresh();
    } catch (err) {
      setError(userMessage(err, "Failed to save that setting."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="py-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p id="metrics-opt-out-label" className="text-sm font-medium text-ink-secondary">
            Leave me out of activity counts
          </p>
          <p className="text-sm text-ink-faint">
            Your visits and time in the world won&apos;t be counted. Posts, comments, and letters
            are part of the site and still show in totals.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={excluded}
          aria-labelledby="metrics-opt-out-label"
          disabled={saving}
          onClick={toggle}
          className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 ${
            excluded ? "border-accent-500 bg-accent-500" : "border-line-strong bg-surface-emphasis"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-surface shadow transition-transform ${
              excluded ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      {success && (
        <p role="status" className="mt-2 text-sm text-green-700">
          {success}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
