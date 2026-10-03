"use client";

import { useState } from "react";
import type { CallLink } from "@/lib/call-link";

/** This device's muted people, by user id. Muting only changes what this
 * member hears, so it's remembered here and nowhere else. */
const STORAGE_KEY = "op-call-muted";
/** More than anyone needs; keeps a corrupted or runaway list bounded. */
const MAX_REMEMBERED = 200;

/** The muted list saved on this device, or an empty one. */
export function loadMutedMembers(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((v): v is string => typeof v === "string").slice(0, MAX_REMEMBERED),
    );
  } catch {
    // Private windows and blocked storage throw; nobody muted is the safe start.
    return new Set();
  }
}

function save(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids].slice(0, MAX_REMEMBERED)));
  } catch {
    // Storage can be full or blocked. The mute still applies for this visit;
    // it just won't be remembered, which is all storage was for.
  }
}

/** Who this member has muted, kept in step with `link` (which starts from the
 * same saved list) and remembered per device. */
export function useMutedMembers(link: CallLink): {
  muted: ReadonlySet<string>;
  toggle: (userId: string) => void;
} {
  const [muted, setMuted] = useState<Set<string>>(loadMutedMembers);

  function toggle(userId: string) {
    const next = new Set(muted);
    const nowMuted = !next.has(userId);
    if (nowMuted) next.add(userId);
    else next.delete(userId);
    setMuted(next);
    link.setMemberMuted(userId, nowMuted);
    save(next);
  }

  return { muted, toggle };
}
