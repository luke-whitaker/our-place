"use client";

import VideoUploader from "../VideoUploader";
import type { UploadedMedia } from "../PhotoUploader";
import { FIELD_CLASS, useComposerState, type PostDraft } from "./post-draft";

interface VideoValue {
  content: string;
  video: UploadedMedia | null;
}

function videoDraft({ content, video }: VideoValue): PostDraft {
  if (!video) return { fields: null, titleRequired: false, status: "" };
  return {
    fields: {
      content: content.trim(),
      media: [
        {
          url: video.url,
          filename: video.filename,
          media_type: video.media_type,
          media_source: video.media_source,
          file_size: video.file_size,
        },
      ],
    },
    titleRequired: false,
    status: video.media_source === "upload" ? "Video attached" : `${video.media_source} embed`,
  };
}

export default function VideoComposer({
  onDraft,
  onError,
}: {
  onDraft: (draft: PostDraft) => void;
  onError: (message: string) => void;
}) {
  const [value, update] = useComposerState<VideoValue>(
    { content: "", video: null },
    videoDraft,
    onDraft,
  );
  return (
    <>
      <VideoUploader
        video={value.video}
        onVideoChange={(video) => update({ video })}
        onError={onError}
      />
      <textarea
        value={value.content}
        onChange={(e) => update({ content: e.target.value })}
        placeholder="Add a caption (optional)"
        rows={2}
        className={`resize-none ${FIELD_CLASS}`}
      />
    </>
  );
}
