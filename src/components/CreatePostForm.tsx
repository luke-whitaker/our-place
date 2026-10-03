"use client";

import type { PostType } from "@/lib/types";
import { useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import TextComposer from "./compose/TextComposer";
import PhotoComposer from "./compose/PhotoComposer";
import VideoComposer from "./compose/VideoComposer";
import RichComposer, { INITIAL_RICH_DRAFT } from "./compose/RichComposer";
import { FIELD_CLASS, NOT_READY, type PostDraft } from "./compose/post-draft";
import InteractionControls, {
  DEFAULT_INTERACTION_CONTROLS,
  InteractionControlsValue,
} from "./feed/InteractionControls";

const POST_TYPE_TABS: { type: PostType; label: string; icon: React.ReactNode }[] = [
  {
    type: "text",
    label: "Text",
    icon: (
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12"
        />
      </svg>
    ),
  },
  {
    type: "photo",
    label: "Photo",
    icon: (
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v13.5A1.5 1.5 0 0 0 3.75 21Z"
        />
      </svg>
    ),
  },
  {
    type: "video",
    label: "Video",
    icon: (
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
        />
      </svg>
    ),
  },
  {
    type: "rich",
    label: "Rich",
    icon: (
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42"
        />
      </svg>
    ),
  },
];

/** The shared title field reads differently per type: required for text and
 * rich posts, optional over a photo or video. */
const TITLE_PLACEHOLDER: Record<PostType, string> = {
  text: "Give your post a title",
  photo: "Title (optional)",
  video: "Title (optional)",
  rich: "Give your post a title",
};

const INITIAL_DRAFTS: Record<PostType, PostDraft> = {
  text: NOT_READY,
  photo: NOT_READY,
  video: NOT_READY,
  rich: INITIAL_RICH_DRAFT,
};

/**
 * The compose form. It holds only what every post type shares (the title,
 * interaction controls, cross-posting); each type's composer owns its own
 * fields and reports a draft. A composer mounts the first time its tab opens
 * (a text box sizes itself on mount, which fails while hidden) and then stays
 * mounted while the form is open, so switching tabs keeps what you'd started,
 * as it always has.
 */
export default function CreatePostForm({
  communityId,
  onPostCreated,
}: {
  communityId?: string;
  onPostCreated: () => void;
}) {
  const isProfileMode = !communityId;
  const [open, setOpen] = useState(false);
  const [postType, setPostType] = useState<PostType>("text");
  const [opened, setOpened] = useState<ReadonlySet<PostType>>(new Set(["text"]));
  const [title, setTitle] = useState("");
  const [drafts, setDrafts] = useState(INITIAL_DRAFTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [postToMyPlace, setPostToMyPlace] = useState(false);
  const [interactionControls, setInteractionControls] = useState<InteractionControlsValue>(
    DEFAULT_INTERACTION_CONTROLS,
  );

  const draft = drafts[postType];
  const ready = draft.fields !== null && (!draft.titleRequired || title.trim().length > 0);

  function reportDraft(type: PostType) {
    return (next: PostDraft) => setDrafts((all) => ({ ...all, [type]: next }));
  }

  function showTab(type: PostType) {
    setPostType(type);
    setOpened((all) => new Set(all).add(type));
    setError("");
  }

  function close() {
    setTitle("");
    setDrafts(INITIAL_DRAFTS);
    setOpened(new Set([postType]));
    setError("");
    setPostToMyPlace(false);
    setInteractionControls(DEFAULT_INTERACTION_CONTROLS);
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || loading) return;
    setLoading(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        post_type: postType,
        allow_reactions: interactionControls.allowReactions,
        allow_comments: interactionControls.allowComments,
        allow_dislikes: interactionControls.allowDislikes,
        title: title.trim(),
        ...draft.fields,
      };
      if (!isProfileMode && postToMyPlace) body.post_to_profile = true;

      const endpoint = isProfileMode
        ? "/api/my-place/posts"
        : `/api/communities/${communityId}/posts`;
      await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      close();
      onPostCreated();
    } catch (err) {
      setError(userMessage(err, "Failed to create post."));
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border-2 border-dashed border-line bg-surface p-5 text-left transition-colors hover:border-accent-300 hover:bg-accent-50/30"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-100 text-accent-600">
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <span className="text-sm font-medium text-ink-muted">
            {isProfileMode
              ? "Share something to My Place..."
              : "Share something with the community..."}
          </span>
        </div>
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="op-card overflow-hidden rounded-2xl border border-line bg-surface shadow-sm"
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-ink">
            {isProfileMode ? "Post to My Place" : "Create a Post"}
          </h3>
          <button
            type="button"
            onClick={close}
            aria-label="Close post form"
            className="rounded-lg p-1 text-ink-faint hover:bg-surface-emphasis hover:text-ink-tertiary"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Post Type Tabs */}
        <div className="mb-4 flex gap-1 rounded-xl bg-surface-emphasis p-1">
          {POST_TYPE_TABS.map((tab) => (
            <button
              key={tab.type}
              type="button"
              onClick={() => showTab(tab.type)}
              // The label hides on narrow screens, so name the button outright.
              aria-label={tab.label}
              aria-pressed={postType === tab.type}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                postType === tab.type
                  ? "bg-surface text-accent-600 shadow-sm"
                  : "text-ink-muted hover:text-ink-secondary"
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Hidden composers keep their state but take no space, so no margin
            stacks up from a tab you aren't on. */}
        <div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={TITLE_PLACEHOLDER[postType]}
            maxLength={200}
            className={FIELD_CLASS}
          />
          {opened.has("text") && (
            <div hidden={postType !== "text"} className="mt-3">
              <TextComposer onDraft={reportDraft("text")} />
            </div>
          )}
          {opened.has("photo") && (
            <div hidden={postType !== "photo"} className="mt-3 space-y-3">
              <PhotoComposer onDraft={reportDraft("photo")} onError={setError} />
            </div>
          )}
          {opened.has("video") && (
            <div hidden={postType !== "video"} className="mt-3 space-y-3">
              <VideoComposer onDraft={reportDraft("video")} onError={setError} />
            </div>
          )}
          {opened.has("rich") && (
            <div hidden={postType !== "rich"} className="mt-3">
              <RichComposer onDraft={reportDraft("rich")} />
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-line-soft bg-surface-muted px-5 py-3">
        <div className="mb-3">
          <InteractionControls value={interactionControls} onChange={setInteractionControls} />
        </div>

        {!isProfileMode && (
          <div className="mb-3 flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setPostToMyPlace(!postToMyPlace)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                postToMyPlace ? "bg-accent-500" : "bg-surface-inset"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-surface transition-transform shadow-sm ${
                  postToMyPlace ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
            <span className="text-xs font-medium text-ink-tertiary">Also post to My Place</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-xs text-ink-faint">{draft.status}</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-lg px-4 py-2 text-sm font-medium text-ink-tertiary hover:bg-surface-inset"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!ready || loading}
              className="rounded-lg bg-accent-500 px-5 py-2 text-sm font-medium text-ink-inverse transition-colors hover:bg-accent-600 disabled:opacity-50"
            >
              {loading ? "Posting..." : "Post"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
