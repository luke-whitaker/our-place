"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { generatePlayerSprites } from "@/lib/game/sprites";
import { DIR } from "@/lib/game/constants";
import type { AvatarConfig } from "@/lib/types";
import { SKIN_TONES, SHIRT_COLORS, PANTS_COLORS, SHOES_COLORS, DEFAULT_AVATAR } from "@/lib/types";

const PREVIEW_SCALE = 8;
const PREVIEW_SIZE = 32 * PREVIEW_SCALE;
const ANIM_INTERVAL = 400;

export default function AvatarBuilderPage() {
  const { user, loading, refresh } = useAuth();
  const router = useRouter();

  const [config, setConfig] = useState<AvatarConfig>(DEFAULT_AVATAR);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [animFrame, setAnimFrame] = useState<0 | 1>(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user?.avatar) {
      setConfig(user.avatar as unknown as AvatarConfig);
    }
  }, [user]);

  useEffect(() => {
    const id = setInterval(() => setAnimFrame((f) => (f === 0 ? 1 : 0)), ANIM_INTERVAL);
    return () => clearInterval(id);
  }, []);

  const renderPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);

    const sprites = generatePlayerSprites(config);
    const sprite = sprites[DIR.DOWN][animFrame];
    ctx.drawImage(sprite, 0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
  }, [config, animFrame]);

  useEffect(() => {
    renderPreview();
  }, [renderPreview]);

  async function handleSave() {
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/auth/avatar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save avatar.");
        return;
      }

      await refresh();
      router.push("/feed");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function update(field: keyof AvatarConfig, value: string) {
    setConfig((prev) => ({ ...prev, [field]: value }));
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-accent-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  const isFirstTime = !user.avatar;

  return (
    <div className="min-h-screen bg-surface-muted px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">
            {isFirstTime ? "Create Your Avatar" : "Edit Your Avatar"}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {isFirstTime
              ? "Welcome to Our Place! Customize your character before entering the world."
              : "Update how you look in the world."}
          </p>
        </div>

        {/* Preview */}
        <div className="flex justify-center mb-8">
          <div className="rounded-2xl border-2 border-line bg-surface-inverse-soft p-6 shadow-lg">
            <canvas
              ref={canvasRef}
              width={PREVIEW_SIZE}
              height={PREVIEW_SIZE}
              style={{ imageRendering: "pixelated" }}
            />
          </div>
        </div>

        {/* Options */}
        <div className="space-y-6 rounded-2xl border border-line bg-surface p-6 shadow-sm">
          {/* Hair Style */}
          <div>
            <label className="block text-sm font-semibold text-ink-secondary mb-3">
              Hair Style
            </label>
            <div className="flex gap-3">
              {(["short", "long"] as const).map((style) => (
                <button
                  key={style}
                  onClick={() => update("hairStyle", style)}
                  className={`flex-1 rounded-xl border-2 px-4 py-3 text-sm font-medium capitalize transition-all ${
                    config.hairStyle === style
                      ? "border-accent-500 bg-accent-50 text-accent-700"
                      : "border-line bg-surface text-ink-tertiary hover:border-line-strong"
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
          </div>

          {/* Skin Tone */}
          <ColorPicker
            label="Skin Tone"
            colors={SKIN_TONES}
            value={config.skinTone}
            onChange={(c) => update("skinTone", c)}
            large
          />

          {/* Shirt Color */}
          <ColorPicker
            label="Shirt Color"
            colors={SHIRT_COLORS}
            value={config.shirtColor}
            onChange={(c) => update("shirtColor", c)}
          />

          {/* Pants Color */}
          <ColorPicker
            label="Pants Color"
            colors={PANTS_COLORS}
            value={config.pantsColor}
            onChange={(c) => update("pantsColor", c)}
          />

          {/* Shoes Color */}
          <ColorPicker
            label="Shoes Color"
            colors={SHOES_COLORS}
            value={config.shoesColor}
            onChange={(c) => update("shoesColor", c)}
          />
        </div>

        {/* Error */}
        {error && (
          <div
            className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-accent-500 to-purple-600 px-6 py-3.5 text-base font-semibold text-ink-inverse shadow-lg shadow-accent-500/25 transition-all hover:shadow-xl hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : isFirstTime ? "Enter the World" : "Save Changes"}
        </button>

        {/* Skip (only on first time) */}
        {isFirstTime && (
          <button
            onClick={() => router.push("/feed")}
            className="mt-3 w-full rounded-xl px-6 py-3 text-sm font-medium text-ink-muted hover:text-ink-secondary transition-colors"
          >
            Skip for now
          </button>
        )}
      </div>
    </div>
  );
}

function ColorPicker({
  label,
  colors,
  value,
  onChange,
  large,
}: {
  label: string;
  colors: readonly string[];
  value: string;
  onChange: (color: string) => void;
  large?: boolean;
}) {
  const size = large ? "w-12 h-12" : "w-10 h-10";

  return (
    <div>
      <label className="block text-sm font-semibold text-ink-secondary mb-3">{label}</label>
      <div className="flex flex-wrap gap-3">
        {colors.map((color) => (
          <button
            key={color}
            onClick={() => onChange(color)}
            className={`${size} rounded-xl border-2 transition-all ${
              value === color
                ? "border-accent-500 ring-2 ring-accent-200 scale-110"
                : "border-line hover:border-line-strong"
            }`}
            style={{ backgroundColor: color }}
            aria-label={`Select ${label.toLowerCase()} ${color}`}
          />
        ))}
      </div>
    </div>
  );
}
