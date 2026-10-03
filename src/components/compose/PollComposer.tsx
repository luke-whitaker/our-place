"use client";

import { FIELD_CLASS, useComposerState, type PostDraft } from "./post-draft";

// Mirrors pollSchema's bounds in schemas.ts; the server checks them again.
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;
const OPTION_MAX_CHARS = 80;

type ClosesIn = "" | "1d" | "3d" | "1w";
type ResultsVisible = "after_vote" | "always" | "after_close";

interface PollValue {
  content: string;
  options: string[];
  multipleChoice: boolean;
  closesIn: ClosesIn;
  resultsVisible: ResultsVisible;
}

function pollDraft(value: PollValue): PostDraft {
  const options = value.options.map((o) => o.trim());
  const filled = options.filter(Boolean);
  const unique = new Set(filled.map((o) => o.toLowerCase())).size === filled.length;
  const ready = filled.length === options.length && filled.length >= MIN_OPTIONS && unique;
  return {
    fields: ready
      ? {
          content: value.content.trim(),
          poll: {
            options,
            multiple_choice: value.multipleChoice,
            results_visible: value.resultsVisible,
            ...(value.closesIn ? { closes_in: value.closesIn } : {}),
          },
        }
      : null,
    titleRequired: true,
    status: !unique ? "Each option needs to be different" : `${options.length} options`,
  };
}

const INITIAL: PollValue = {
  content: "",
  options: ["", ""],
  multipleChoice: false,
  closesIn: "",
  resultsVisible: "after_vote",
};

/** The empty poll's draft, before anyone types. */
export const INITIAL_POLL_DRAFT = pollDraft(INITIAL);

const SELECT_CLASS =
  "rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink focus:border-accent-400 focus:outline-none";

export default function PollComposer({ onDraft }: { onDraft: (draft: PostDraft) => void }) {
  const [value, update] = useComposerState<PollValue>(INITIAL, pollDraft, onDraft);

  function setOption(index: number, text: string) {
    update({ options: value.options.map((o, i) => (i === index ? text : o)) });
  }

  return (
    <>
      <div className="space-y-2">
        {value.options.map((option, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={option}
              onChange={(e) => setOption(i, e.target.value)}
              placeholder={`Option ${i + 1}`}
              maxLength={OPTION_MAX_CHARS}
              aria-label={`Option ${i + 1}`}
              className={FIELD_CLASS}
            />
            {value.options.length > MIN_OPTIONS && (
              <button
                type="button"
                onClick={() => update({ options: value.options.filter((_, j) => j !== i) })}
                aria-label={`Remove option ${i + 1}`}
                className="rounded-lg p-1.5 text-ink-faint hover:bg-surface-emphasis hover:text-ink-tertiary"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {value.options.length < MAX_OPTIONS && (
          <button
            type="button"
            onClick={() => update({ options: [...value.options, ""] })}
            className="text-xs font-medium text-accent-600 hover:text-accent-700"
          >
            + Add option
          </button>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs font-medium text-ink-tertiary">
        <input
          type="checkbox"
          checked={value.multipleChoice}
          onChange={(e) => update({ multipleChoice: e.target.checked })}
        />
        Let people pick more than one
      </label>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-tertiary">
        <label className="flex items-center gap-2">
          Closes
          <select
            aria-label="Closes"
            value={value.closesIn}
            onChange={(e) => {
              const closesIn = e.target.value as ClosesIn;
              // A poll that never closes can't show results when it closes.
              const resultsVisible =
                !closesIn && value.resultsVisible === "after_close"
                  ? "after_vote"
                  : value.resultsVisible;
              update({ closesIn, resultsVisible });
            }}
            className={SELECT_CLASS}
          >
            <option value="">Never</option>
            <option value="1d">In 1 day</option>
            <option value="3d">In 3 days</option>
            <option value="1w">In 1 week</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          Results show
          <select
            aria-label="Results show"
            value={value.resultsVisible}
            onChange={(e) => update({ resultsVisible: e.target.value as ResultsVisible })}
            className={SELECT_CLASS}
          >
            <option value="after_vote">After you vote</option>
            <option value="always">Always</option>
            <option value="after_close" disabled={!value.closesIn}>
              When it closes
            </option>
          </select>
        </label>
      </div>

      <textarea
        value={value.content}
        onChange={(e) => update({ content: e.target.value })}
        placeholder="Add some context (optional)"
        rows={2}
        className={`resize-none ${FIELD_CLASS}`}
      />
    </>
  );
}
