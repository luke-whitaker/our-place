"use client";

import type { RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";
import { EMOTES, type Emote } from "@/lib/types";
import type { IsoState, PresenceFrame } from "./iso-engine";
import { startPresence, type PresenceSession } from "./presence-session";

/** Keys 1 to 6 show the six emotes, in picker order. */
const EMOTE_KEYS = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"];

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/** Whether the local player is walking freely: no menu, overlay, dialogue,
 * fade, or confirm flash. Emotes only go out then. */
function canEmote(state: IsoState | null): state is IsoState {
  return state !== null && state.mode === "overworld" && state.confirm === null;
}

/**
 * Live presence for one world, for signed-in members only; a logged-out
 * visitor gets nothing and makes no requests. Returns `frame`, for the game
 * loop to call once per frame, and `emote`, for the picker. Both are stable.
 */
export function usePresence(
  worldId: string,
  enabled: boolean,
  stateRef: RefObject<IsoState | null>,
): {
  frame: (state: IsoState, now: number) => PresenceFrame | undefined;
  emote: (kind: Emote) => void;
} {
  const sessionRef = useRef<PresenceSession | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const session = startPresence(worldId, () => stateRef.current);
    sessionRef.current = session;
    return () => {
      session.close();
      sessionRef.current = null;
    };
  }, [worldId, enabled, stateRef]);

  const emote = useCallback(
    (kind: Emote) => {
      const state = stateRef.current;
      if (!canEmote(state)) return;
      sessionRef.current?.emote(kind, state);
    },
    [stateRef],
  );

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(e: KeyboardEvent) {
      const index = EMOTE_KEYS.indexOf(e.code);
      if (index < 0 || e.repeat || isTypingTarget(e.target)) return;
      emote(EMOTES[index]);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, emote]);

  const frame = useCallback(
    (state: IsoState, now: number) => sessionRef.current?.frame(state, now),
    [],
  );

  return { frame, emote };
}
