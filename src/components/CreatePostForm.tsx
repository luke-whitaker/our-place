"use client";

import { useState } from "react";
import { PostType } from "@/lib/types";
import RichContentEditor, { EditorBlock, createEmptyTextBlock } from "./RichContentEditor";
import PhotoUploader from "./PhotoUploader";
import VideoUploader from "./VideoUploader";
import type { UploadedMedia } from "./PhotoUploader";

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
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [postToMyPlace, setPostToMyPlace] = useState(false);

  const [photos, setPhotos] = useState<UploadedMedia[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [video, setVideo] = useState<UploadedMedia | null>(null);
  const [richBlocks, setRichBlocks] = useState<EditorBlock[]>([createEmptyTextBlock()]);

  function resetForm() {
    setTitle("");
    setContent("");
    setError("");
    setPhotos([]);
    setVideo(null);
    setRichBlocks([createEmptyTextBlock()]);
    setPostToMyPlace(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const body: Record<string, unknown> = { post_type: postType };

      if (postType === "text") {
        if (!title.trim() || !content.trim()) {
          setError("Title and content are required.");
          setLoading(false);
          return;
        }
        body.title = title.trim();
        body.content = content.trim();
      }

      if (postType === "photo") {
        if (photos.length === 0) {
          setError("Please add at least one photo.");
          setLoading(false);
          return;
        }
        body.title = title.trim();
        body.content = content.trim();
        body.media = photos.map((p) => ({
          url: p.url,
          filename: p.filename,
          media_type: p.media_type,
          media_source: p.media_source,
          file_size: p.file_size,
        }));
      }

      if (postType === "video") {
        if (!video) {
          setError("Please add a video.");
          setLoading(false);
          return;
        }
        body.title = title.trim();
        body.content = content.trim();
        body.media = [
          {
            url: video.url,
            filename: video.filename,
            media_type: video.media_type,
            media_source: video.media_source,
            file_size: video.file_size,
          },
        ];
      }

      if (postType === "rich") {
        if (!title.trim()) {
          setError("Title is required for rich posts.");
          setLoading(false);
          return;
        }
        const serializedBlocks = richBlocks
          .filter((b) => {
            if (b.type === "text") return b.content.trim().length > 0;
            if (b.type === "image" || b.type === "video") return b.url.length > 0;
            return false;
          })
          .map((b) => {
            if (b.type === "text") return { type: "text", content: b.content };
            if (b.type === "image") return { type: "image", url: b.url, alt: b.alt };
            if (b.type === "video")
              return { type: "video", url: b.url, media_source: b.media_source };
            return b;
          });

        if (serializedBlocks.length === 0) {
          setError("Please add some content.");
          setLoading(false);
          return;
        }

        body.title = title.trim();
        body.content = JSON.stringify(serializedBlocks);
      }

      if (!isProfileMode && postToMyPlace) {
        body.post_to_profile = true;
      }

      const endpoint = isProfileMode
        ? "/api/my-place/posts"
        : `/api/communities/${communityId}/posts`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create post.");
        return;
      }

      resetForm();
      setOpen(false);
      onPostCreated();
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function canSubmit(): boolean {
    if (loading) return false;
    if (postType === "text") return !!(title.trim() && content.trim());
    if (postType === "photo") return photos.length > 0 && !uploadingPhotos;
    if (postType === "video") return !!video;
    if (postType === "rich") {
      if (!title.trim()) return false;
      const hasContent = richBlocks.some(
        (b) =>
          (b.type === "text" && b.content.trim()) ||
          ((b.type === "image" || b.type === "video") && b.url),
      );
      const isUploading = richBlocks.some((b) => b.uploading);
      return hasContent && !isUploading;
    }
    return false;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border-2 border-dashed border-gray-200 bg-white p-5 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/30"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
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
          <span className="text-sm font-medium text-gray-500">
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
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">
            {isProfileMode ? "Post to My Place" : "Create a Post"}
          </h3>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setOpen(false);
            }}
            aria-label="Close post form"
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
        <div className="mb-4 flex gap-1 rounded-xl bg-gray-100 p-1">
          {POST_TYPE_TABS.map((tab) => (
            <button
              key={tab.type}
              type="button"
              onClick={() => {
                setPostType(tab.type);
                setError("");
              }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                postType === tab.type
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
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

        {/* Text Post */}
        {postType === "text" && (
          <div className="space-y-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give your post a title"
              maxLength={200}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What would you like to share?"
              rows={4}
              className="w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
        )}

        {/* Photo Post */}
        {postType === "photo" && (
          <div className="space-y-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (optional)"
              maxLength={200}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <PhotoUploader
              photos={photos}
              uploading={uploadingPhotos}
              onPhotosChange={setPhotos}
              onUploadingChange={setUploadingPhotos}
              onError={setError}
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Add a caption (optional)"
              rows={2}
              className="w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
        )}

        {/* Video Post */}
        {postType === "video" && (
          <div className="space-y-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (optional)"
              maxLength={200}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <VideoUploader video={video} onVideoChange={setVideo} onError={setError} />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Add a caption (optional)"
              rows={2}
              className="w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>
        )}

        {/* Rich Post */}
        {postType === "rich" && (
          <div className="space-y-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give your post a title"
              maxLength={200}
              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <RichContentEditor blocks={richBlocks} onChange={setRichBlocks} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 bg-gray-50 px-5 py-3">
        {!isProfileMode && (
          <div className="mb-3 flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setPostToMyPlace(!postToMyPlace)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                postToMyPlace ? "bg-indigo-500" : "bg-gray-200"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform shadow-sm ${
                  postToMyPlace ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
            <span className="text-xs font-medium text-gray-600">Also post to My Place</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-400">
            {postType === "photo" && photos.length > 0 && `${photos.length}/10 images`}
            {postType === "video" &&
              video &&
              (video.media_source === "upload" ? "Video attached" : `${video.media_source} embed`)}
            {postType === "rich" && `${richBlocks.length} block${richBlocks.length > 1 ? "s" : ""}`}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                resetForm();
                setOpen(false);
              }}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit()}
              className="rounded-lg bg-indigo-500 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
            >
              {loading ? "Posting..." : "Post"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
