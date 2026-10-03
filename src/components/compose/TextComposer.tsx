"use client";

import { FIELD_CLASS, useComposerState, type PostDraft } from "./post-draft";

interface TextValue {
  content: string;
}

function textDraft({ content }: TextValue): PostDraft {
  const body = content.trim();
  return { fields: body ? { content: body } : null, titleRequired: true, status: "" };
}

export default function TextComposer({ onDraft }: { onDraft: (draft: PostDraft) => void }) {
  const [value, update] = useComposerState<TextValue>({ content: "" }, textDraft, onDraft);
  return (
    <textarea
      value={value.content}
      onChange={(e) => update({ content: e.target.value })}
      placeholder="What would you like to share?"
      rows={4}
      className={`resize-none ${FIELD_CLASS}`}
    />
  );
}
