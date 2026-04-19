"use client";

import { useState, useRef } from "react";
import {
  parseVideoUrl,
  ACCEPTED_VIDEO_TYPES,
  MAX_VIDEO_SIZE,
  formatFileSize,
} from "@/lib/media-utils";
import type { UploadedMedia } from "./PhotoUploader";

export default function VideoUploader({
  video,
  onVideoChange,
  onError,
}: {
  video: UploadedMedia | null;
  onVideoChange: (video: UploadedMedia | null) => void;
  onError: (error: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoMode, setVideoMode] = useState<"upload" | "embed">("upload");
  const videoInputRef = useRef<HTMLInputElement>(null);

  async function handleVideoFileSelect(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];

    if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) {
      onError("Unsupported video format. Use MP4, WebM, or MOV.");
      return;
    }
    if (file.size > MAX_VIDEO_SIZE) {
      onError(`Video is too large. Maximum size is ${formatFileSize(MAX_VIDEO_SIZE)}.`);
      return;
    }

    setUploading(true);
    onError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        onVideoChange({
          url: data.url,
          filename: data.filename,
          media_type: "video",
          media_source: "upload",
          file_size: data.file_size,
        });
      } else {
        onError(data.error || "Failed to upload video.");
      }
    } catch {
      onError("Failed to upload video.");
    }
    setUploading(false);
  }

  function handleVideoEmbed() {
    if (!videoUrl.trim()) return;
    const parsed = parseVideoUrl(videoUrl.trim());
    if (!parsed) {
      onError("Invalid video URL. Please use a YouTube or Vimeo link.");
      return;
    }
    onError("");
    onVideoChange({
      url: videoUrl.trim(),
      filename: "",
      media_type: "video",
      media_source: parsed.source,
      file_size: null,
    });
  }

  if (video) {
    return (
      <div className="relative">
        {video.media_source === "upload" ? (
          <video
            src={video.url}
            controls
            className="w-full rounded-xl"
            style={{ maxHeight: "300px" }}
          />
        ) : (
          <div className="aspect-video overflow-hidden rounded-xl border border-gray-200">
            <iframe
              src={parseVideoUrl(video.url)?.embedUrl || video.url}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            onVideoChange(null);
            setVideoUrl("");
          }}
          aria-label="Remove video"
          className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Upload / Embed toggle */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
        <button
          type="button"
          onClick={() => setVideoMode("upload")}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
            videoMode === "upload" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
          }`}
        >
          Upload File
        </button>
        <button
          type="button"
          onClick={() => setVideoMode("embed")}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
            videoMode === "embed" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
          }`}
        >
          Embed URL
        </button>
      </div>

      {videoMode === "upload" ? (
        <>
          <input
            ref={videoInputRef}
            type="file"
            accept={ACCEPTED_VIDEO_TYPES.join(",")}
            className="hidden"
            onChange={(e) => {
              handleVideoFileSelect(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add("border-indigo-400", "bg-indigo-50/50");
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("border-indigo-400", "bg-indigo-50/50");
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove("border-indigo-400", "bg-indigo-50/50");
              handleVideoFileSelect(e.dataTransfer.files);
            }}
            className="flex w-full items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 py-8 transition-colors hover:border-indigo-300 hover:bg-indigo-50/30"
          >
            {uploading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                Uploading video...
              </div>
            ) : (
              <div className="text-center">
                <svg
                  className="mx-auto h-10 w-10 text-gray-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
                  />
                </svg>
                <p className="mt-2 text-sm font-medium text-gray-500">
                  Drag & drop a video or click to browse
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  MP4, WebM, MOV · Max {formatFileSize(MAX_VIDEO_SIZE)}
                </p>
              </div>
            )}
          </button>
        </>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="Paste a YouTube or Vimeo URL"
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <button
              type="button"
              onClick={handleVideoEmbed}
              disabled={!videoUrl.trim()}
              className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
            >
              Embed
            </button>
          </div>
          {videoUrl && parseVideoUrl(videoUrl) && (
            <div className="aspect-video overflow-hidden rounded-lg border border-gray-200">
              <iframe
                src={parseVideoUrl(videoUrl)!.embedUrl}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
