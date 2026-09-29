"use client";

import { useEffect, useRef, useState } from "react";
import { PAL } from "@/lib/game/constants";
import AvatarPreview from "@/components/AvatarPreview";
import OverlayActionButton from "@/components/OverlayActionButton";
import {
  HAIR_COLORS,
  HAIR_STYLES,
  OUTFIT_NAME_MAX,
  PANTS_COLORS,
  SHIRT_COLORS,
  SHOES_COLORS,
  type AvatarConfig,
  type HairStyle,
  type OutfitLook,
} from "@/lib/types";

interface OutfitEditorProps {
  /** The member's own look; only its skin is used, for the preview. */
  avatar: AvatarConfig;
  initialName: string;
  /** Only a look, never a whole outfit row: a row's own `name` spread into the
   * saved body once overwrote the name typed here. */
  initial: OutfitLook;
  busy: boolean;
  /** "Save" on an outfit being edited, "Save as new outfit" from Wearing now. */
  saveLabel: string;
  /** Why saving isn't possible (a full armoire), shown in place of the button. */
  saveBlockedReason?: string;
  onSave: (name: string, look: OutfitLook) => void;
  /** Put the look on now without saving it. Only offered from Wearing now. */
  onWear?: (look: OutfitLook) => void;
  onCancel: () => void;
}

const COLOR_PARTS = [
  { key: "hair_color", label: "Hair color", palette: HAIR_COLORS },
  { key: "shirt", label: "Shirt", palette: SHIRT_COLORS },
  { key: "pants", label: "Pants", palette: PANTS_COLORS },
  { key: "shoes", label: "Shoes", palette: SHOES_COLORS },
] as const;

const STYLE_LABELS: Record<HairStyle, string> = { short: "Short", long: "Long" };

/** The member's character wearing a look: skin from the avatar, everything
 * else from the look. */
export function previewOf(avatar: AvatarConfig, look: OutfitLook): AvatarConfig {
  return {
    hairStyle: look.hair_style,
    hairColor: look.hair_color,
    skinTone: avatar.skinTone,
    shirtColor: look.shirt,
    pantsColor: look.pants,
    shoesColor: look.shoes,
  };
}

/**
 * <OutfitEditor /> — change a look (hair style, hair color, and clothes) with
 * the member's character wearing the draft beside it, then save it, or from
 * Wearing now, wear it straight away. Colors come from the avatar builder's
 * palettes; a color from outside them (what the member wore already) stays
 * selected until they pick another. Skin has no control here, on purpose.
 */
export default function OutfitEditor(props: OutfitEditorProps) {
  const { avatar, busy } = props;
  const [name, setName] = useState(props.initialName);
  const [look, setLook] = useState<OutfitLook>(props.initial);
  const ref = useRef<HTMLDivElement>(null);

  // On a phone the panel is short and the editor opens below the list, so
  // without this "+" or Edit looks like it did nothing.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);

  return (
    <div ref={ref} className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <AvatarPreview config={previewOf(avatar, look)} scale={3} />
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
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm" style={{ color: PAL.light }}>
          Hair style
        </legend>
        <div className="flex gap-1.5">
          {HAIR_STYLES.map((style) => (
            <button
              key={style}
              type="button"
              aria-pressed={look.hair_style === style}
              onClick={() => setLook((l) => ({ ...l, hair_style: style }))}
              className="min-h-11 touch-manipulation rounded-sm border-2 px-4 text-sm font-bold aria-pressed:bg-white/15 aria-pressed:outline aria-pressed:outline-2 aria-pressed:outline-offset-1"
              style={{ borderColor: PAL.textBorder, color: PAL.white, outlineColor: PAL.white }}
            >
              {STYLE_LABELS[style]}
            </button>
          ))}
        </div>
      </fieldset>
      {COLOR_PARTS.map(({ key, label, palette }) => (
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
                aria-pressed={look[key].toLowerCase() === color.toLowerCase()}
                onClick={() => setLook((l) => ({ ...l, [key]: color }))}
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
      {props.saveBlockedReason && (
        <p className="text-xs" style={{ color: PAL.light }}>
          {props.saveBlockedReason}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {props.onWear && (
          <OverlayActionButton onClick={() => props.onWear?.(look)} disabled={busy}>
            Wear it
          </OverlayActionButton>
        )}
        <OverlayActionButton
          onClick={() => props.onSave(name.trim(), look)}
          disabled={busy || Boolean(props.saveBlockedReason)}
        >
          {props.saveLabel}
        </OverlayActionButton>
        <OverlayActionButton onClick={props.onCancel} variant="secondary" disabled={busy}>
          Cancel
        </OverlayActionButton>
      </div>
    </div>
  );
}
