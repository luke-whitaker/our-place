"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetch, userMessage } from "@/lib/api-client";

/** The account's on/off settings, by their PATCH /api/auth/account field. */
export type AccountSwitchField = "exclude_from_metrics" | "email_gatherings";

// One on/off setting on the Account tab, saved the moment it changes, like
// the theme picker.
export default function AccountSwitch({
  field,
  initial,
  label,
  description,
  onText,
  offText,
}: {
  field: AccountSwitchField;
  initial: boolean;
  label: string;
  description: string;
  /** What to say once it's saved on, and once it's saved off. */
  onText: string;
  offText: string;
}) {
  const { refresh } = useAuth();
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const labelId = `${field}-label`;

  async function toggle() {
    const next = !on;
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      await apiFetch("/api/auth/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: next }),
      });
      setOn(next);
      setSuccess(next ? onText : offText);
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
          <p id={labelId} className="text-sm font-medium text-ink-secondary">
            {label}
          </p>
          <p className="text-sm text-ink-faint">{description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={labelId}
          disabled={saving}
          onClick={toggle}
          className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 ${
            on ? "border-accent-500 bg-accent-500" : "border-line-strong bg-surface-emphasis"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-surface shadow transition-transform ${
              on ? "translate-x-6" : "translate-x-1"
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
