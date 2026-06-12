"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { parseVideoUrl } from "@/lib/media-utils";

export interface EditorBlock {
  id: string;
  type: "text" | "image" | "video";
  content: string;
  url: string;
  alt: string;
  media_source: "upload" | "youtube" | "vimeo";
  uploading: boolean;
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

export function createEmptyTextBlock(): EditorBlock {
  return {
    id: genId(),
    type: "text",
    content: "",
    url: "",
    alt: "",
    media_source: "upload",
    uploading: false,
  };
}

function AutoResizeTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, []);

  useEffect(() => {
    resize();
  }, [value, resize]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        resize();
      }}
      placeholder={placeholder}
      rows={2}
      className="w-full resize-none border-0 bg-transparent px-0 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-0"
    />
  );
}

function AddBlockButton({ onAdd }: { onAdd: (type: "text" | "image" | "video") => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex items-center justify-center py-1">
      <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-line" />
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface text-ink-faint transition-colors hover:border-accent-300 hover:text-accent-500"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full z-20 mt-1 flex gap-1 rounded-lg border border-line bg-surface p-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              onAdd("text");
              setOpen(false);
            }}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-surface-emphasis"
          >
            <svg
              className="h-3.5 w-3.5"
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
            Text
          </button>
          <button
            type="button"
            onClick={() => {
              onAdd("image");
              setOpen(false);
            }}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-surface-emphasis"
          >
            <svg
              className="h-3.5 w-3.5"
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
            Image
          </button>
          <button
            type="button"
            onClick={() => {
              onAdd("video");
              setOpen(false);
            }}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-secondary hover:bg-surface-emphasis"
          >
            <svg
              className="h-3.5 w-3.5"
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
            Video
          </button>
        </div>
      )}
    </div>
  );
}

export default function RichContentEditor({
  blocks,
  onChange,
}: {
  blocks: EditorBlock[];
  onChange: (blocks: EditorBlock[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeImageBlockId, setActiveImageBlockId] = useState<string | null>(null);

  function updateBlock(id: string, updates: Partial<EditorBlock>) {
    onChange(blocks.map((b) => (b.id === id ? { ...b, ...updates } : b)));
  }

  function removeBlock(id: string) {
    if (blocks.length <= 1) return;
    onChange(blocks.filter((b) => b.id !== id));
  }

  function addBlockAfter(afterId: string, type: "text" | "image" | "video") {
    const idx = blocks.findIndex((b) => b.id === afterId);
    const newBlock: EditorBlock = {
      id: genId(),
      type,
      content: "",
      url: "",
      alt: "",
      media_source: "upload",
      uploading: false,
    };
    const newBlocks = [...blocks];
    newBlocks.splice(idx + 1, 0, newBlock);
    onChange(newBlocks);
  }

  async function uploadImageForBlock(blockId: string, file: File) {
    updateBlock(blockId, { uploading: true });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        updateBlock(blockId, { url: data.url, uploading: false });
      } else {
        updateBlock(blockId, { uploading: false });
      }
    } catch {
      updateBlock(blockId, { uploading: false });
    }
  }

  function handleImageSelect(blockId: string) {
    setActiveImageBlockId(blockId);
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && activeImageBlockId) {
      uploadImageForBlock(activeImageBlockId, file);
    }
    e.target.value = "";
  }

  function handleVideoUrlChange(blockId: string, url: string) {
    const parsed = parseVideoUrl(url);
    if (parsed) {
      updateBlock(blockId, { url, media_source: parsed.source });
    } else {
      updateBlock(blockId, { url, media_source: "upload" });
    }
  }

  async function handleVideoFileUpload(blockId: string, file: File) {
    updateBlock(blockId, { uploading: true });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok) {
        updateBlock(blockId, { url: data.url, media_source: "upload", uploading: false });
      } else {
        updateBlock(blockId, { uploading: false });
      }
    } catch {
      updateBlock(blockId, { uploading: false });
    }
  }

  return (
    <div className="space-y-0">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {blocks.map((block, idx) => (
        <div key={block.id}>
          {/* Block */}
          <div className="group relative rounded-xl border border-line-soft bg-surface-muted/50 px-4 py-3 transition-colors hover:border-line">
            {/* Block type badge + delete */}
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                {block.type === "text" && "Text"}
                {block.type === "image" && "Image"}
                {block.type === "video" && "Video"}
              </span>
              {blocks.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeBlock(block.id)}
                  className="rounded p-0.5 text-ink-disabled opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                >
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
                      d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                    />
                  </svg>
                </button>
              )}
            </div>

            {/* Text Block */}
            {block.type === "text" && (
              <AutoResizeTextarea
                value={block.content}
                onChange={(v) => updateBlock(block.id, { content: v })}
                placeholder="Write something..."
              />
            )}

            {/* Image Block */}
            {block.type === "image" && (
              <div>
                {block.uploading ? (
                  <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface">
                    <div className="flex items-center gap-2 text-sm text-ink-muted">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
                      Uploading...
                    </div>
                  </div>
                ) : block.url ? (
                  <div className="space-y-2">
                    <div className="relative overflow-hidden rounded-lg">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={block.url}
                        alt={block.alt || ""}
                        className="w-full rounded-lg object-cover"
                        style={{ maxHeight: "300px" }}
                      />
                      <button
                        type="button"
                        onClick={() => updateBlock(block.id, { url: "", alt: "" })}
                        className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-ink-inverse hover:bg-black/70"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18 18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                    <input
                      type="text"
                      value={block.alt}
                      onChange={(e) => updateBlock(block.id, { alt: e.target.value })}
                      placeholder="Alt text (optional)"
                      className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink-secondary placeholder-ink-faint focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleImageSelect(block.id)}
                    className="flex h-32 w-full items-center justify-center rounded-lg border-2 border-dashed border-line bg-surface transition-colors hover:border-accent-300 hover:bg-accent-50/30"
                  >
                    <div className="text-center">
                      <svg
                        className="mx-auto h-8 w-8 text-ink-disabled"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v13.5A1.5 1.5 0 0 0 3.75 21Z"
                        />
                      </svg>
                      <p className="mt-1 text-xs text-ink-faint">Click to add an image</p>
                    </div>
                  </button>
                )}
              </div>
            )}

            {/* Video Block */}
            {block.type === "video" && (
              <div>
                {block.uploading ? (
                  <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface">
                    <div className="flex items-center gap-2 text-sm text-ink-muted">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
                      Uploading video...
                    </div>
                  </div>
                ) : block.url ? (
                  <div className="space-y-2">
                    <div className="relative">
                      {block.media_source === "youtube" || block.media_source === "vimeo" ? (
                        (() => {
                          const parsed = parseVideoUrl(block.url);
                          return parsed ? (
                            <div className="aspect-video overflow-hidden rounded-lg">
                              <iframe
                                src={parsed.embedUrl}
                                className="h-full w-full"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                              />
                            </div>
                          ) : null;
                        })()
                      ) : (
                        <video
                          src={block.url}
                          controls
                          className="w-full rounded-lg"
                          style={{ maxHeight: "300px" }}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => updateBlock(block.id, { url: "", media_source: "upload" })}
                        className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-ink-inverse hover:bg-black/70"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18 18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="url"
                      placeholder="Paste a YouTube or Vimeo URL..."
                      onChange={(e) => handleVideoUrlChange(block.id, e.target.value)}
                      className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-secondary placeholder-ink-faint focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
                    />
                    <div className="flex items-center gap-2">
                      <div className="flex-1 border-t border-line" />
                      <span className="text-xs text-ink-faint">or</span>
                      <div className="flex-1 border-t border-line" />
                    </div>
                    <label className="flex h-24 w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-line bg-surface transition-colors hover:border-accent-300 hover:bg-accent-50/30">
                      <input
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleVideoFileUpload(block.id, f);
                          e.target.value = "";
                        }}
                      />
                      <div className="text-center">
                        <svg
                          className="mx-auto h-6 w-6 text-ink-disabled"
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
                        <p className="mt-1 text-xs text-ink-faint">Upload a video file</p>
                      </div>
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Add block button between blocks */}
          {idx < blocks.length - 1 && (
            <AddBlockButton onAdd={(type) => addBlockAfter(block.id, type)} />
          )}
        </div>
      ))}

      {/* Add block button at the end */}
      <AddBlockButton onAdd={(type) => addBlockAfter(blocks[blocks.length - 1].id, type)} />
    </div>
  );
}
