import { useRef, useState } from "react";

/**
 * What one post type's composer tells the form: the request fields it adds
 * once it can be posted (null until then), whether the shared title field is
 * required for it, and a short status line for the form's footer.
 */
export interface PostDraft {
  fields: Record<string, unknown> | null;
  titleRequired: boolean;
  status: string;
}

export const NOT_READY: PostDraft = { fields: null, titleRequired: false, status: "" };

/**
 * A composer's own state, reported to the form as a draft on every change.
 * The latest value lives in a ref so a callback that finishes later (an
 * upload) builds on what's current, not on the render that started it.
 */
export function useComposerState<T extends object>(
  initial: T,
  toDraft: (value: T) => PostDraft,
  onDraft: (draft: PostDraft) => void,
): [T, (patch: Partial<T>) => void] {
  const [value, setValue] = useState(initial);
  const latest = useRef(initial);
  function update(patch: Partial<T>) {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setValue(next);
    onDraft(toDraft(next));
  }
  return [value, update];
}

/** The class every composer field shares, so the form reads as one piece. */
export const FIELD_CLASS =
  "w-full rounded-xl border border-line px-4 py-2.5 text-sm text-ink placeholder-ink-faint focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400";
