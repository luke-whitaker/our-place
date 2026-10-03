"use client";

import RichContentEditor, { createEmptyTextBlock, type EditorBlock } from "../RichContentEditor";
import { useComposerState, type PostDraft } from "./post-draft";

interface RichValue {
  blocks: EditorBlock[];
}

/** The blocks worth sending: text with words in it, media with a URL. */
function serializeBlocks(blocks: EditorBlock[]) {
  return blocks
    .filter((b) => (b.type === "text" ? b.content.trim().length > 0 : b.url.length > 0))
    .map((b) => {
      if (b.type === "text") return { type: "text", content: b.content };
      if (b.type === "image") return { type: "image", url: b.url, alt: b.alt };
      return { type: "video", url: b.url, media_source: b.media_source };
    });
}

function richDraft({ blocks }: RichValue): PostDraft {
  const serialized = serializeBlocks(blocks);
  const ready = serialized.length > 0 && !blocks.some((b) => b.uploading);
  return {
    fields: ready ? { content: JSON.stringify(serialized) } : null,
    titleRequired: true,
    status: `${blocks.length} block${blocks.length > 1 ? "s" : ""}`,
  };
}

const INITIAL: RichValue = { blocks: [createEmptyTextBlock()] };

/** What the form shows for a rich post before anyone touches it. */
export const INITIAL_RICH_DRAFT = richDraft(INITIAL);

export default function RichComposer({ onDraft }: { onDraft: (draft: PostDraft) => void }) {
  const [value, update] = useComposerState<RichValue>(INITIAL, richDraft, onDraft);
  return <RichContentEditor blocks={value.blocks} onChange={(blocks) => update({ blocks })} />;
}
