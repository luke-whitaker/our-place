"use client";

import { useEffect, useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import { isAvatarConfig } from "@/lib/game/avatar-recolor";
import { PAL } from "@/lib/game/constants";
import { useAuth } from "@/components/AuthProvider";
import AvatarPreview from "@/components/AvatarPreview";
import InlineConfirm from "@/components/InlineConfirm";
import OverlayActionButton from "@/components/OverlayActionButton";
import OverlayPanel from "@/components/OverlayPanel";
import OutfitEditor, { previewOf } from "@/components/OutfitEditor";
import {
  MAX_OUTFITS,
  type ArmoireContents,
  type AvatarConfig,
  type Outfit,
  type OutfitLook,
} from "@/lib/types";

/** What's picked in the list: Ghost Mode, or one saved outfit by id. */
type Selection = "ghost" | string | null;

/** What the editor is open on: a saved outfit by id, or "new" (the "+" on
 * Wearing now, starting from what you're wearing). */
type Editing = string | "new" | null;

/** How see-through the ghost preview is, matching the world (GHOST_ALPHA). */
const GHOST_PREVIEW_OPACITY = 0.45;

function outfitTitle(outfit: Outfit): string {
  return outfit.name || `Outfit ${outfit.slot + 1}`;
}

/** Just the look of an outfit, without its id, slot, or name. */
function lookOf(o: OutfitLook): OutfitLook {
  return {
    hair_style: o.hair_style,
    hair_color: o.hair_color,
    shirt: o.shirt,
    pants: o.pants,
    shoes: o.shoes,
  };
}

const FULL_REASON = `Your armoire holds ${MAX_OUTFITS} outfits. Remove one to save another.`;

/**
 * <ArmoirePanel /> — the owner's armoire: up to five saved outfits and Ghost
 * Mode. Pick one to see your character in it, then wear it, edit it, or
 * remove it; or save what you're wearing now. Wearing or ghosting refreshes
 * the signed-in user, so the world re-paints you (or fades you) at once.
 * Only the owner ever sees this; WorldOverlays shows a visitor the locked line.
 */
export default function ArmoirePanel({ onClose }: { onClose: () => void }) {
  const { user, refresh } = useAuth();
  const avatar = isAvatarConfig(user?.avatar) ? user.avatar : null;
  const [contents, setContents] = useState<ArmoireContents | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [editingId, setEditingId] = useState<Editing>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiFetch<ArmoireContents>("/api/outfits")
      .then((c) => {
        if (!cancelled) setContents(c);
      })
      .catch((err) => {
        if (!cancelled) setError(userMessage(err, "Failed to open your armoire."));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function pick(next: Selection) {
    setSelection(next);
    setEditingId(null);
    setConfirmingRemove(false);
    setError("");
  }

  /** Run one armoire action; `apply` updates the contents from its result. */
  async function act(
    run: () => Promise<(c: ArmoireContents) => ArmoireContents>,
    fallback: string,
    refreshUser = false,
  ) {
    setBusy(true);
    setError("");
    try {
      const apply = await run();
      setContents((c) => (c ? apply(c) : c));
      setEditingId(null);
      setConfirmingRemove(false);
      // The world reads the avatar and Ghost Mode from the signed-in user.
      if (refreshUser) await refresh();
    } catch (err) {
      setError(userMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  /** Save a look as a new outfit in the first empty spot, and pick it. */
  function save(name: string, look: OutfitLook) {
    void act(async () => {
      const res = await apiFetch<{ outfit: Outfit }>("/api/outfits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ...lookOf(look) }),
      });
      setSelection(res.outfit.id);
      return (c) => ({ ...c, outfits: [...c.outfits, res.outfit].sort((a, b) => a.slot - b.slot) });
    }, "Failed to save that outfit.");
  }

  function wear(outfit: Outfit) {
    void act(
      async () => {
        await apiFetch(`/api/outfits/${outfit.id}/wear`, { method: "POST" });
        return (c) => ({ ...c, wearing: lookOf(outfit), ghost: false });
      },
      "Failed to put that outfit on.",
      true,
    );
  }

  /** Put a look on straight from the "+" editor, without saving it. */
  function wearLook(look: OutfitLook) {
    void act(
      async () => {
        await apiFetch("/api/outfits/wear", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(lookOf(look)),
        });
        setSelection(null);
        return (c) => ({ ...c, wearing: lookOf(look), ghost: false });
      },
      "Failed to put that on.",
      true,
    );
  }

  function edit(outfit: Outfit, name: string, look: OutfitLook) {
    void act(async () => {
      const res = await apiFetch<{ outfit: Outfit }>(`/api/outfits/${outfit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ...lookOf(look) }),
      });
      return (c) => ({
        ...c,
        outfits: c.outfits.map((o) => (o.id === outfit.id ? res.outfit : o)),
      });
    }, "Failed to change that outfit.");
  }

  function remove(outfit: Outfit) {
    void act(async () => {
      await apiFetch(`/api/outfits/${outfit.id}`, { method: "DELETE" });
      setSelection(null);
      return (c) => ({ ...c, outfits: c.outfits.filter((o) => o.id !== outfit.id) });
    }, "Failed to remove that outfit.");
  }

  function setGhost(on: boolean) {
    void act(
      async () => {
        await apiFetch("/api/outfits/ghost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ on }),
        });
        return (c) => ({ ...c, ghost: on });
      },
      "Failed to change Ghost Mode.",
      true,
    );
  }

  const outfit = contents?.outfits.find((o) => o.id === selection) ?? null;
  const editing = outfit && editingId === outfit.id ? outfit : null;
  const full = (contents?.outfits.length ?? 0) >= MAX_OUTFITS;

  function openNewLook() {
    setSelection(null);
    setConfirmingRemove(false);
    setError("");
    setEditingId("new");
  }

  return (
    <OverlayPanel title="Armoire" onClose={onClose}>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!contents && !error && (
        <p className="text-sm" style={{ color: PAL.light }}>
          Loading...
        </p>
      )}
      {contents && !avatar && (
        <p className="text-sm" style={{ color: PAL.light }}>
          Build your character first, then come back to try on outfits.
        </p>
      )}
      {contents && avatar && (
        <>
          <ArmoireList
            contents={contents}
            selection={selection}
            busy={busy}
            onPick={pick}
            onNewLook={openNewLook}
          />
          {editingId === "new" && contents.wearing ? (
            <OutfitEditor
              key="new"
              avatar={avatar}
              initialName=""
              initial={contents.wearing}
              busy={busy}
              saveLabel="Save as new outfit"
              saveBlockedReason={full ? FULL_REASON : undefined}
              onSave={save}
              onWear={wearLook}
              onCancel={() => setEditingId(null)}
            />
          ) : editing ? (
            <OutfitEditor
              key={editing.id}
              avatar={avatar}
              initialName={editing.name}
              initial={lookOf(editing)}
              busy={busy}
              saveLabel="Save"
              onSave={(name, look) => edit(editing, name, look)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <SelectionDetail
              avatar={avatar}
              contents={contents}
              selection={selection}
              outfit={outfit}
              busy={busy}
              confirmingRemove={confirmingRemove}
              onWear={wear}
              onEdit={(o) => setEditingId(o.id)}
              onAskRemove={() => setConfirmingRemove(true)}
              onCancelRemove={() => setConfirmingRemove(false)}
              onRemove={remove}
              onGhost={setGhost}
              onSaveWearing={(look) => save("", look)}
            />
          )}
        </>
      )}
    </OverlayPanel>
  );
}

/** The armoire's rows: what you're wearing now, Ghost Mode (always there), then
 * each saved outfit. */
function ArmoireList({
  contents,
  selection,
  busy,
  onPick,
  onNewLook,
}: {
  contents: ArmoireContents;
  selection: Selection;
  busy: boolean;
  onPick: (s: Selection) => void;
  onNewLook: () => void;
}) {
  const rowClass =
    "flex min-h-11 w-full touch-manipulation items-center gap-2 rounded-sm border px-2 text-left text-sm aria-pressed:border-2 aria-pressed:bg-white/10";
  return (
    <div className="flex flex-col gap-1.5">
      {contents.wearing && (
        // Two sibling buttons, not one inside the other: a button can't hold a
        // button, and the "+" does something different from picking the row.
        <div className="flex gap-1.5">
          <button
            type="button"
            aria-pressed={selection === null}
            onClick={() => onPick(null)}
            className={rowClass}
            style={{ borderColor: PAL.textBorder, color: PAL.white }}
          >
            <Swatches look={contents.wearing} />
            <span className="flex-1 font-bold">Wearing now</span>
          </button>
          <button
            type="button"
            onClick={onNewLook}
            // A save still in flight closes the editor when it finishes, so
            // opening a new one meanwhile would vanish from under the member.
            disabled={busy}
            aria-label="Change what you're wearing"
            title="Change what you're wearing"
            className="flex min-h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-sm border text-xl font-bold hover:bg-white/10 disabled:opacity-40"
            style={{ borderColor: PAL.textBorder, color: PAL.white }}
          >
            +
          </button>
        </div>
      )}
      <button
        type="button"
        aria-pressed={selection === "ghost"}
        onClick={() => onPick("ghost")}
        className={rowClass}
        style={{ borderColor: PAL.textBorder, color: PAL.white }}
      >
        <span aria-hidden className="w-16 text-center text-lg">
          👻
        </span>
        <span className="flex-1 font-bold">Ghost Mode</span>
        {contents.ghost && <span style={{ color: PAL.light }}>On</span>}
      </button>
      {contents.outfits.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={selection === o.id}
          onClick={() => onPick(o.id)}
          className={rowClass}
          style={{ borderColor: PAL.textBorder, color: PAL.white }}
        >
          <Swatches look={o} />
          <span className="flex-1 truncate font-bold">{outfitTitle(o)}</span>
        </button>
      ))}
      <p className="text-xs" style={{ color: PAL.light }}>
        {contents.outfits.length} of {MAX_OUTFITS} outfits saved
      </p>
    </div>
  );
}

/** Hair, shirt, pants, shoes: one small swatch each. */
function Swatches({ look }: { look: OutfitLook }) {
  return (
    <span aria-hidden className="flex w-16 justify-center gap-0.5">
      {[look.hair_color, look.shirt, look.pants, look.shoes].map((c, i) => (
        <span
          key={i}
          className="h-4 w-3.5 rounded-sm border"
          style={{ backgroundColor: c, borderColor: PAL.textBorder }}
        />
      ))}
    </span>
  );
}

interface SelectionDetailProps {
  avatar: AvatarConfig;
  contents: ArmoireContents;
  selection: Selection;
  outfit: Outfit | null;
  busy: boolean;
  confirmingRemove: boolean;
  onWear: (o: Outfit) => void;
  onEdit: (o: Outfit) => void;
  onAskRemove: () => void;
  onCancelRemove: () => void;
  onRemove: (o: Outfit) => void;
  onGhost: (on: boolean) => void;
  onSaveWearing: (wearing: OutfitLook) => void;
}

/** Your character in whatever's picked, and what you can do with it. With
 * nothing picked, it's what you're wearing now, which you can save. */
function SelectionDetail(props: SelectionDetailProps) {
  const { avatar, contents, selection, outfit, busy } = props;
  const border = "flex items-start gap-3 border-t pt-2";

  if (selection === "ghost") {
    return (
      <div className={border} style={{ borderColor: PAL.textBorder }}>
        <div style={{ opacity: GHOST_PREVIEW_OPACITY }}>
          <AvatarPreview config={avatar} scale={3} />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <p className="text-sm" style={{ color: PAL.lightest }}>
            {contents.ghost
              ? "You're a ghost. Nobody else can see you or your emotes, anywhere in the world."
              : "Walk around unseen. You'll see yourself faintly; nobody else will see you at all."}
          </p>
          <OverlayActionButton onClick={() => props.onGhost(!contents.ghost)} disabled={busy}>
            {contents.ghost ? "Become visible" : "Turn on Ghost Mode"}
          </OverlayActionButton>
        </div>
      </div>
    );
  }

  if (outfit) {
    return (
      <div className={border} style={{ borderColor: PAL.textBorder }}>
        <AvatarPreview config={previewOf(avatar, outfit)} scale={3} />
        <div className="flex flex-1 flex-col gap-2">
          <p className="text-sm font-bold" style={{ color: PAL.white }}>
            {outfitTitle(outfit)}
          </p>
          {props.confirmingRemove ? (
            <InlineConfirm
              message="Remove this outfit from your armoire?"
              onConfirm={() => props.onRemove(outfit)}
              onCancel={props.onCancelRemove}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              <OverlayActionButton onClick={() => props.onWear(outfit)} disabled={busy}>
                Wear
              </OverlayActionButton>
              <OverlayActionButton onClick={() => props.onEdit(outfit)} disabled={busy}>
                Edit
              </OverlayActionButton>
              <OverlayActionButton onClick={props.onAskRemove} variant="secondary" disabled={busy}>
                Remove
              </OverlayActionButton>
            </div>
          )}
        </div>
      </div>
    );
  }

  const wearing = contents.wearing;
  const full = contents.outfits.length >= MAX_OUTFITS;
  return (
    <div className={border} style={{ borderColor: PAL.textBorder }}>
      <div style={{ opacity: contents.ghost ? GHOST_PREVIEW_OPACITY : 1 }}>
        <AvatarPreview config={avatar} scale={3} />
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <p className="text-sm" style={{ color: PAL.lightest }}>
          {contents.ghost ? "What you're wearing, as a ghost." : "What you're wearing now."}
        </p>
        {wearing && (
          <OverlayActionButton onClick={() => props.onSaveWearing(wearing)} disabled={busy || full}>
            {full ? "Armoire full" : "Save this outfit"}
          </OverlayActionButton>
        )}
      </div>
    </div>
  );
}
