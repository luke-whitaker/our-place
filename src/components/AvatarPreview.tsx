"use client";

import { useEffect, useRef, useState } from "react";
import type { AvatarConfig } from "@/lib/types";
import { worldAsset } from "@/lib/game/asset-url";
import { loadCharacterSheet, SHEET, type CharacterSprites } from "@/lib/game/character-sheet";

const WALK_FRAME_MS = 130;

/**
 * The user's actual in-world character, palette-swapped to their avatar
 * colors — the same sheet + recolor pipeline the world renders with, so the
 * preview can't drift from what walks around the Capital.
 */
export default function AvatarPreview({
  config,
  scale = 4,
  animate = false,
}: {
  config: AvatarConfig;
  scale?: number;
  animate?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sprites, setSprites] = useState<CharacterSprites | null>(null);
  const [error, setError] = useState("");

  // Serialize so color-object identity churn doesn't re-trigger loads; the
  // sheet fetch is browser-cached, so a change costs one recolor pass.
  const configKey = JSON.stringify(config);
  useEffect(() => {
    let cancelled = false;
    loadCharacterSheet(worldAsset("/world/characters/long.png"), JSON.parse(configKey))
      .then((loaded) => {
        if (!cancelled) setSprites(loaded);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load the character preview.");
      });
    return () => {
      cancelled = true;
    };
  }, [configKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sprites) return;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    function draw(frame: HTMLCanvasElement) {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.drawImage(frame, 0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    if (!animate) {
      draw(sprites.idle.S);
      return;
    }
    let frame = 0;
    draw(sprites.walk.S[frame]);
    const id = setInterval(() => {
      frame = (frame + 1) % sprites.walk.S.length;
      draw(sprites.walk.S[frame]);
    }, WALK_FRAME_MS);
    return () => clearInterval(id);
  }, [sprites, animate]);

  if (error) {
    return <p className="text-xs text-red-600">{error}</p>;
  }

  return (
    <canvas
      ref={canvasRef}
      width={SHEET.frameW * scale}
      height={SHEET.frameH * scale}
      style={{ imageRendering: "pixelated" }}
      aria-label="Your character"
    />
  );
}
