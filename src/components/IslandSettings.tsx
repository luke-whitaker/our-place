"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { apiFetch, userMessage } from "@/lib/api-client";
import { TINT_PRESETS, isTintPreset, type TintPreset } from "@/lib/game/terrain-tint";
import type { IslandVisibility } from "@/lib/types";

const BIOME_LABELS: Record<TintPreset, { name: string; blurb: string }> = {
  forest: { name: "Forest", blurb: "The woods as painted." },
  autumn: { name: "Autumn", blurb: "Golden ground and red canopies, pines stay green." },
  snow: { name: "Snow", blurb: "Pale ground and frosted trees." },
  dusk: { name: "Dusk", blurb: "The same place at evening." },
  swamp: { name: "Swamp", blurb: "Olive and murky." },
  scorched: { name: "Scorched", blurb: "Dead grass and dry leaves." },
};

const VISIBILITY_OPTIONS: ReadonlyArray<{ value: IslandVisibility; label: string }> = [
  { value: "anyone", label: "Anyone" },
  { value: "friends", label: "Only my friends" },
  { value: "nobody", label: "No one" },
];

function isIslandVisibility(value: unknown): value is IslandVisibility {
  return value === "anyone" || value === "friends" || value === "nobody";
}

/** One biome swatch, styled like the Appearance theme picker's option buttons. */
function BiomeOption({
  preset,
  selected,
  onSelect,
}: {
  preset: TintPreset;
  selected: boolean;
  onSelect: (preset: TintPreset) => void;
}) {
  const { name, blurb } = BIOME_LABELS[preset];
  return (
    <button
      type="button"
      onClick={() => onSelect(preset)}
      aria-pressed={selected}
      className={`rounded-xl border p-3 text-left transition-colors ${
        selected
          ? "border-accent-400 ring-1 ring-accent-400 bg-accent-50"
          : "border-line hover:border-line-strong"
      }`}
    >
      <span className="block text-sm font-medium text-ink">{name}</span>
      <span className="mt-0.5 block text-xs text-ink-muted">{blurb}</span>
    </button>
  );
}

// The Account tab's "Your island" section: the biome tint and who may visit,
// both stored on the user row and read back by /world when it builds the
// island (its own component per CLAUDE.md's ~60-line guidance — AccountSettings
// is already long).
export default function IslandSettings() {
  const { user, refresh } = useAuth();
  const [biome, setBiome] = useState<TintPreset>(() =>
    user && isTintPreset(user.biome) ? user.biome : "forest",
  );
  const [visibility, setVisibility] = useState<IslandVisibility>(() =>
    user && isIslandVisibility(user.island_visibility) ? user.island_visibility : "friends",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!user) return null;

  async function handleSave() {
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      await apiFetch("/api/auth/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ biome, island_visibility: visibility }),
      });
      setSuccess("Island updated.");
      await refresh();
    } catch (err) {
      setError(userMessage(err, "Failed to update your island."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="py-2">
      <p className="text-sm font-medium text-ink-secondary">Your island</p>
      <p className="text-sm text-ink-faint">
        The biome and who may visit your floating My Place island
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TINT_PRESETS.map((preset) => (
          <BiomeOption
            key={preset}
            preset={preset}
            selected={biome === preset}
            onSelect={setBiome}
          />
        ))}
      </div>

      <div className="mt-4">
        <label htmlFor="island-visibility" className="text-sm font-medium text-ink-secondary">
          Who can visit your My Place island?
        </label>
        <select
          id="island-visibility"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as IslandVisibility)}
          className="mt-1.5 w-full max-w-xs rounded-xl border border-line px-4 py-2.5 text-sm text-ink focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
        >
          {VISIBILITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div role="alert" className="mt-3 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
          {error}
        </div>
      )}
      {success && (
        <div
          role="status"
          className="mt-3 rounded-lg bg-green-50 px-4 py-2.5 text-sm text-green-700"
        >
          {success}
        </div>
      )}

      <div className="mt-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-ink-inverse transition-colors hover:bg-accent-600 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
