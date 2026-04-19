"use client";

import { useState, useEffect, useCallback } from "react";
import { PostMedia as PostMediaType, RichContentBlock } from "@/lib/types";
import { parseVideoUrl } from "@/lib/media-utils";

// ── Photo Gallery ──
export function PhotoGallery({ media }: { media: PostMediaType[] }) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const images = media.filter((m) => m.media_type === "image");
  if (images.length === 0) return null;

  const count = images.length;

  const handleLightboxKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (lightboxIdx === null) return;
      if (e.key === "Escape") setLightboxIdx(null);
      if (e.key === "ArrowLeft" && lightboxIdx > 0) setLightboxIdx(lightboxIdx - 1);
      if (e.key === "ArrowRight" && lightboxIdx < images.length - 1)
        setLightboxIdx(lightboxIdx + 1);
    },
    [lightboxIdx, images.length],
  );

  useEffect(() => {
    if (lightboxIdx !== null) {
      document.addEventListener("keydown", handleLightboxKeyDown);
      return () => document.removeEventListener("keydown", handleLightboxKeyDown);
    }
  }, [lightboxIdx, handleLightboxKeyDown]);

  return (
    <>
      <div className="mt-3 overflow-hidden rounded-xl">
        {count === 1 && (
          <button type="button" onClick={() => setLightboxIdx(0)} className="block w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[0].url}
              alt="Post image"
              className="w-full object-cover cursor-pointer transition-transform hover:scale-[1.02]"
              style={{ maxHeight: "400px" }}
            />
          </button>
        )}

        {count === 2 && (
          <div className="grid grid-cols-2 gap-0.5">
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setLightboxIdx(i)}
                className="block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt="Post image"
                  className="aspect-square w-full object-cover cursor-pointer transition-transform hover:scale-[1.02]"
                />
              </button>
            ))}
          </div>
        )}

        {count === 3 && (
          <div className="grid grid-cols-2 gap-0.5" style={{ height: "300px" }}>
            <button
              type="button"
              onClick={() => setLightboxIdx(0)}
              className="row-span-2 block h-full"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={images[0].url}
                alt="Post image"
                className="h-full w-full object-cover cursor-pointer transition-transform hover:scale-[1.02]"
              />
            </button>
            <button type="button" onClick={() => setLightboxIdx(1)} className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={images[1].url}
                alt="Post image"
                className="h-full w-full object-cover cursor-pointer transition-transform hover:scale-[1.02]"
              />
            </button>
            <button type="button" onClick={() => setLightboxIdx(2)} className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={images[2].url}
                alt="Post image"
                className="h-full w-full object-cover cursor-pointer transition-transform hover:scale-[1.02]"
              />
            </button>
          </div>
        )}

        {count >= 4 && (
          <div className="grid grid-cols-2 gap-0.5" style={{ height: "300px" }}>
            {images.slice(0, 4).map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setLightboxIdx(i)}
                className="relative block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt="Post image"
                  className="h-full w-full object-cover cursor-pointer transition-transform hover:scale-[1.02]"
                />
                {i === 3 && count > 4 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <span className="text-2xl font-bold text-white">+{count - 4}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIdx !== null && (
        <div
          role="dialog"
          aria-label="Image viewer"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxIdx(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[lightboxIdx].url}
              alt="Post image"
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            />

            {/* Close */}
            <button
              type="button"
              onClick={() => setLightboxIdx(null)}
              aria-label="Close image viewer"
              className="absolute -right-2 -top-2 rounded-full bg-white p-1.5 shadow-lg hover:bg-gray-100"
            >
              <svg
                className="h-5 w-5 text-gray-700"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Prev / Next */}
            {images.length > 1 && (
              <>
                {lightboxIdx > 0 && (
                  <button
                    type="button"
                    onClick={() => setLightboxIdx(lightboxIdx - 1)}
                    aria-label="Previous image"
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow hover:bg-white"
                  >
                    <svg
                      className="h-5 w-5 text-gray-700"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 19.5 8.25 12l7.5-7.5"
                      />
                    </svg>
                  </button>
                )}
                {lightboxIdx < images.length - 1 && (
                  <button
                    type="button"
                    onClick={() => setLightboxIdx(lightboxIdx + 1)}
                    aria-label="Next image"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow hover:bg-white"
                  >
                    <svg
                      className="h-5 w-5 text-gray-700"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m8.25 4.5 7.5 7.5-7.5 7.5"
                      />
                    </svg>
                  </button>
                )}
              </>
            )}

            {/* Counter */}
            {images.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                {lightboxIdx + 1} / {images.length}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Video Player ──
export function VideoPlayer({ media }: { media: PostMediaType }) {
  if (media.media_source === "youtube" || media.media_source === "vimeo") {
    const parsed = parseVideoUrl(media.url);
    if (!parsed) return null;
    return (
      <div className="mt-3 aspect-video overflow-hidden rounded-xl">
        <iframe
          src={parsed.embedUrl}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="mt-3 overflow-hidden rounded-xl">
      <video src={media.url} controls className="w-full" style={{ maxHeight: "400px" }} />
    </div>
  );
}

// ── Rich Content Renderer ──
function parseRichContent(content: string): RichContentBlock[] | null {
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function RichContentRenderer({ content }: { content: string }) {
  const blocks = parseRichContent(content);

  if (!blocks) {
    return (
      <p className="mt-1.5 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{content}</p>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {blocks.map((block, idx) => {
        if (block.type === "text" && block.content) {
          return (
            <p key={idx} className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
              {block.content}
            </p>
          );
        }
        if (block.type === "image" && block.url) {
          return (
            <div key={idx} className="overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={block.url}
                alt={block.alt || ""}
                className="w-full object-cover"
                style={{ maxHeight: "400px" }}
              />
              {block.alt && <p className="mt-1 text-xs text-gray-400 italic">{block.alt}</p>}
            </div>
          );
        }
        if (block.type === "video" && block.url) {
          if (block.media_source === "youtube" || block.media_source === "vimeo") {
            const parsed = parseVideoUrl(block.url);
            if (parsed) {
              return (
                <div key={idx} className="aspect-video overflow-hidden rounded-xl">
                  <iframe
                    src={parsed.embedUrl}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              );
            }
          }
          return (
            <div key={idx} className="overflow-hidden rounded-xl">
              <video src={block.url} controls className="w-full" style={{ maxHeight: "400px" }} />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

// ── Post Type Badge ──
export function PostTypeBadge({ postType }: { postType: string }) {
  if (postType === "text" || !postType) return null;

  const config: Record<string, { label: string; color: string }> = {
    photo: { label: "Photo", color: "bg-emerald-50 text-emerald-600" },
    video: { label: "Video", color: "bg-purple-50 text-purple-600" },
    rich: { label: "Rich", color: "bg-amber-50 text-amber-600" },
  };

  const c = config[postType];
  if (!c) return null;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.color}`}
    >
      {c.label}
    </span>
  );
}
