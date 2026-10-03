"use client";

import PhotoUploader, { type UploadedMedia } from "../PhotoUploader";
import { FIELD_CLASS, useComposerState, type PostDraft } from "./post-draft";

interface PhotoValue {
  content: string;
  photos: UploadedMedia[];
  uploading: boolean;
}

function photoDraft({ content, photos, uploading }: PhotoValue): PostDraft {
  const ready = photos.length > 0 && !uploading;
  return {
    fields: ready
      ? {
          content: content.trim(),
          media: photos.map((p) => ({
            url: p.url,
            filename: p.filename,
            media_type: p.media_type,
            media_source: p.media_source,
            file_size: p.file_size,
          })),
        }
      : null,
    titleRequired: false,
    status: photos.length > 0 ? `${photos.length}/10 images` : "",
  };
}

export default function PhotoComposer({
  onDraft,
  onError,
}: {
  onDraft: (draft: PostDraft) => void;
  onError: (message: string) => void;
}) {
  const [value, update] = useComposerState<PhotoValue>(
    { content: "", photos: [], uploading: false },
    photoDraft,
    onDraft,
  );
  return (
    <>
      <PhotoUploader
        photos={value.photos}
        uploading={value.uploading}
        onPhotosChange={(photos) => update({ photos })}
        onUploadingChange={(uploading) => update({ uploading })}
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
