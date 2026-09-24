"use client";

import { PAL } from "@/lib/game/constants";
import OverlayActionButton from "@/components/OverlayActionButton";

interface InlineConfirmProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * <InlineConfirm /> — "Throw this note away? It's gone for good." with Yes/No
 * buttons, in place of `window.confirm`. Every destructive action in the
 * world's DOM overlays (discarding a note, tearing out or crumpling a
 * notebook page, leaving unsaved edits) asks this way instead, so it shares
 * one look and one 44px tap target.
 */
export default function InlineConfirm({ message, onConfirm, onCancel }: InlineConfirmProps) {
  return (
    <div
      className="flex flex-col gap-2 rounded-sm border px-3 py-2"
      style={{ borderColor: PAL.textBorder }}
    >
      <p className="text-sm" style={{ color: PAL.white }}>
        {message}
      </p>
      <div className="flex gap-2">
        <OverlayActionButton onClick={onConfirm}>Yes</OverlayActionButton>
        <OverlayActionButton onClick={onCancel} variant="secondary">
          No
        </OverlayActionButton>
      </div>
    </div>
  );
}
