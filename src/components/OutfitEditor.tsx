"use client";

import { useState } from "react";
import { PAL } from "@/lib/game/constants";
import AvatarPreview from "@/components/AvatarPreview";
import OverlayActionButton from "@/components/OverlayActionButton";
import {
  OUTFIT_NAME_MAX,
  PANTS_COLORS,
  SHIRT_COLORS,
  SHOES_COLORS,
  type AvatarConfig,
  type OutfitColors,
} from "@/lib/types";

interface OutfitEditorProps {
  /** The member's own look, for skin and hair in the preview. */
  avatar: AvatarConfig;
  initialName: string;
  initial: OutfitColors;
  busy: boolean;
  onSave: (name: string, colors: OutfitColors) => void;
  onCancel: () => void;
}

const PARTS = [
  { key: "shirt", label: "Shirt", palette: SHIRT_COLORS },
  { key: "pants", label: "Pants", palette: PANTS_COLORS },
  { key: "shoes", label: "Shoes", palette: SHOES_COLORS },
] as const;

/**
 * <OutfitEditor /> — rename a saved outfit or change its colors, with the
 * member's character wearing the draft beside it. Colors come from the avatar
 * builder's palettes; a color saved from outside them (what the member wore
 * already) stays selected until they pick another.
 */
export default function OutfitEditor({
  avatar,
  initialName,
  initial,
  busy,
  onSave,
  onCancel,
}: OutfitEditorProps) {
  const [name, setName] = useState(initialName);
  const [colors, setColors] = useState<OutfitColors>(initial);
  const preview = {
    ...avatar,
    shirtColor: colors.shirt,
    pantsColor: colors.pants,
    shoesColor: colors.shoes,
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <AvatarPreview config={preview} scale={3} />
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm" style={{ color: PAL.light }}>
          Name (optional)
          <input
            value={name}
            maxLength={OUTFIT_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            className="min-h-11 rounded-sm border bg-transparent px-2 text-base"
            style={{ borderColor: PAL.textBorder, color: PAL.white }}
          />
        </label>
      </div>
      {PARTS.map(({ key, label, palette }) => (
        <fieldset key={key} className="flex flex-col gap-1">
          <legend className="text-sm" style={{ color: PAL.light }}>
            {label}
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {palette.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`${label} ${color}`}
                aria-pressed={colors[key].toLowerCase() === color.toLowerCase()}
                onClick={() => setColors((c) => ({ ...c, [key]: color }))}
                className="h-9 w-9 touch-manipulation rounded-sm border-2 aria-pressed:outline aria-pressed:outline-2 aria-pressed:outline-offset-1"
                style={{
                  backgroundColor: color,
                  borderColor: PAL.textBorder,
                  outlineColor: PAL.white,
                }}
              />
            ))}
          </div>
        </fieldset>
      ))}
      <div className="flex gap-2">
        <OverlayActionButton onClick={() => onSave(name.trim(), colors)} disabled={busy}>
          Save
        </OverlayActionButton>
        <OverlayActionButton onClick={onCancel} variant="secondary" disabled={busy}>
          Cancel
        </OverlayActionButton>
      </div>
    </div>
  );
}
