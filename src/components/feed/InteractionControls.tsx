"use client";

export interface InteractionControlsValue {
  allowReactions: boolean;
  allowComments: boolean;
  allowDislikes: boolean;
}

export const DEFAULT_INTERACTION_CONTROLS: InteractionControlsValue = {
  allowReactions: true,
  allowComments: true,
  allowDislikes: false,
};

// The author's compose-time choices for how a post can be interacted with.
// Reactions and comments default on; dislikes default off and only make
// sense once reactions are allowed, so turning reactions off clears it too.
export default function InteractionControls({
  value,
  onChange,
}: {
  value: InteractionControlsValue;
  onChange: (value: InteractionControlsValue) => void;
}) {
  function toggle(key: keyof InteractionControlsValue) {
    const next = { ...value, [key]: !value[key] };
    if (key === "allowReactions" && !next.allowReactions) next.allowDislikes = false;
    onChange(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="text-xs font-medium text-ink-tertiary">Interaction</span>
      <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
        <input
          type="checkbox"
          checked={value.allowReactions}
          onChange={() => toggle("allowReactions")}
          className="h-3.5 w-3.5 accent-accent-500"
        />
        Allow reactions
      </label>
      <label className="flex items-center gap-1.5 text-xs text-ink-secondary">
        <input
          type="checkbox"
          checked={value.allowComments}
          onChange={() => toggle("allowComments")}
          className="h-3.5 w-3.5 accent-accent-500"
        />
        Allow comments
      </label>
      <label
        className={`flex items-center gap-1.5 text-xs ${
          value.allowReactions ? "text-ink-secondary" : "text-ink-disabled"
        }`}
      >
        <input
          type="checkbox"
          checked={value.allowDislikes}
          disabled={!value.allowReactions}
          onChange={() => toggle("allowDislikes")}
          className="h-3.5 w-3.5 accent-accent-500 disabled:cursor-not-allowed"
        />
        Allow dislikes
      </label>
    </div>
  );
}
