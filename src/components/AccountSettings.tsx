"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { THEMES, THEME_LABELS, applyTheme, isTheme, type Theme } from "@/lib/theme";
import { isAvatarConfig } from "@/lib/game/avatar-recolor";
import { useAuth } from "@/components/AuthProvider";
import AvatarPreview from "@/components/AvatarPreview";

type EditableField = "email" | "phone" | "password";

// Swatch backgrounds previewing each theme: [card surface, accent dot].
// Hardcoded so every option shows its own colors regardless of the active theme.
const THEME_SWATCHES: Record<Theme, [string, string]> = {
  auto: ["linear-gradient(135deg, #fff 50%, #0e1310 50%)", "#30309c"],
  platinum: ["#fff", "#30309c"],
  terminal: ["#0e1310", "#4fd66b"],
  dusk: ["#fdf9f1", "#7c5cbf"],
};

const inputClass =
  "w-full rounded-xl border border-line px-4 py-2.5 text-sm text-ink placeholder-ink-faint focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400";

const editButtonClass =
  "rounded-lg bg-accent-50 px-3 py-1.5 text-sm font-medium text-accent-600 hover:bg-accent-100 transition-colors";

export default function AccountSettings() {
  const { user, refresh, logout } = useAuth();
  const [editing, setEditing] = useState<EditableField | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [theme, setTheme] = useState<Theme>("auto");
  useEffect(() => {
    if (user && isTheme(user.theme)) setTheme(user.theme);
  }, [user]);

  if (!user) return null;

  async function selectTheme(next: Theme) {
    if (next === theme) return;
    setTheme(next);
    applyTheme(next); // instant — saving happens in the background
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/auth/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save appearance.");
        return;
      }
      setSuccess("Appearance updated.");
      await refresh();
    } catch {
      setError("Something went wrong saving your appearance.");
    }
  }

  function startEditing(field: EditableField) {
    setEditing(field);
    setError("");
    setSuccess("");
    setEmail(user?.email || "");
    setPhone(user?.phone || "");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  function cancelEditing() {
    setEditing(null);
    setError("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const body: Record<string, string> = {};
    if (editing === "email") {
      if (!email.trim()) {
        setError("Email cannot be empty.");
        return;
      }
      body.email = email.trim();
    }
    if (editing === "phone") {
      // Phone is optional — an empty value removes the number from the account.
      body.phone = phone.trim();
    }
    if (editing === "password") {
      if (newPassword.length < 8) {
        setError("New password must be at least 8 characters.");
        return;
      }
      if (newPassword !== confirmPassword) {
        setError("New passwords do not match.");
        return;
      }
      body.current_password = currentPassword;
      body.new_password = newPassword;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update account.");
        return;
      }
      setSuccess(editing === "password" ? "Password changed." : "Account updated.");
      setEditing(null);
      await refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  function renderEditForm(field: EditableField) {
    return (
      <form onSubmit={handleSave} className="mt-3 space-y-3">
        {field === "email" && (
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoFocus
            className={inputClass}
          />
        )}
        {field === "phone" && (
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone number (leave blank to remove)"
            autoFocus
            className={inputClass}
          />
        )}
        {field === "password" && (
          <>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              autoComplete="current-password"
              autoFocus
              className={inputClass}
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (8+ characters)"
              autoComplete="new-password"
              className={inputClass}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              className={inputClass}
            />
          </>
        )}

        {error && (
          <div role="alert" className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-ink-inverse transition-colors hover:bg-accent-600 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={cancelEditing}
            className="rounded-lg px-4 py-2 text-sm font-medium text-ink-tertiary hover:bg-surface-emphasis"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="op-card mt-6 rounded-2xl border border-line bg-surface p-6">
      <h2 className="text-lg font-semibold text-ink mb-4">Account</h2>

      {success && (
        <div
          role="status"
          className="mb-4 rounded-lg bg-green-50 px-4 py-2.5 text-sm text-green-700"
        >
          {success}
        </div>
      )}

      <div className="space-y-3">
        {/* Email */}
        <div className="py-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink-secondary">Email</p>
              <p className="text-sm text-ink-faint">{user.email}</p>
            </div>
            {editing !== "email" && (
              <button onClick={() => startEditing("email")} className={editButtonClass}>
                Edit
              </button>
            )}
          </div>
          {editing === "email" && renderEditForm("email")}
        </div>
        <div className="border-t border-line-soft" />

        {/* Phone */}
        <div className="py-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink-secondary">Phone</p>
              <p className="text-sm text-ink-faint">{user.phone || "—"}</p>
            </div>
            {editing !== "phone" && (
              <button onClick={() => startEditing("phone")} className={editButtonClass}>
                Edit
              </button>
            )}
          </div>
          {editing === "phone" && renderEditForm("phone")}
        </div>
        <div className="border-t border-line-soft" />

        {/* Password */}
        <div className="py-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink-secondary">Password</p>
              <p className="text-sm text-ink-faint">••••••••</p>
            </div>
            {editing !== "password" && (
              <button onClick={() => startEditing("password")} className={editButtonClass}>
                Change
              </button>
            )}
          </div>
          {editing === "password" && renderEditForm("password")}
        </div>
        <div className="border-t border-line-soft" />

        {/* Username (read-only) */}
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-medium text-ink-secondary">Username</p>
            <p className="text-sm text-ink-faint">@{user.username}</p>
          </div>
        </div>
        <div className="border-t border-line-soft" />

        {/* Avatar */}
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-4">
            {isAvatarConfig(user.avatar) && <AvatarPreview config={user.avatar} scale={2} />}
            <div>
              <p className="text-sm font-medium text-ink-secondary">Avatar</p>
              <p className="text-sm text-ink-faint">
                {user.avatar ? "Your character in the world" : "Not customized yet"}
              </p>
            </div>
          </div>
          <Link href="/avatar-builder" className={editButtonClass}>
            {user.avatar ? "Edit" : "Create"}
          </Link>
        </div>
        <div className="border-t border-line-soft" />

        {/* Appearance */}
        <div className="py-2">
          <p className="text-sm font-medium text-ink-secondary">Appearance</p>
          <p className="text-sm text-ink-faint">How Our Place looks, on all your devices</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {THEMES.map((t) => {
              const selected = theme === t;
              const [swatchBg, swatchAccent] = THEME_SWATCHES[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => selectTheme(t)}
                  aria-pressed={selected}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    selected
                      ? "border-accent-400 ring-1 ring-accent-400 bg-accent-50"
                      : "border-line hover:border-line-strong"
                  }`}
                >
                  <span
                    className="relative block h-8 w-full rounded-lg border border-line"
                    style={{ background: swatchBg }}
                  >
                    <span
                      className="absolute bottom-1 right-1 h-3 w-3 rounded-full"
                      style={{ background: swatchAccent }}
                    />
                  </span>
                  <span className="mt-2 block text-sm font-medium text-ink">
                    {THEME_LABELS[t].name}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    {THEME_LABELS[t].blurb}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="border-t border-line-soft" />

        {/* Sign out */}
        <button
          onClick={logout}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
            />
          </svg>
          Sign Out
        </button>
      </div>
    </div>
  );
}
