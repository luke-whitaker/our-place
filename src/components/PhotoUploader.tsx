"use client";

import { useRef } from "react";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_SIZE,
  formatFileSize,
} from "@/lib/media-utils";

export interface UploadedMedia {
  url: string;
  filename: string;
  media_type: "image" | "video";
  media_source: "upload" | "youtube" | "vimeo";
  file_size: number | null;
}

export default function PhotoUploader({
  photos,
  uploading,
  onPhotosChange,
  onUploadingChange,
  onError,
}: {
  photos: UploadedMedia[];
  uploading: boolean;
  onPhotosChange: (photos: UploadedMedia[]) => void;
  onUploadingChange: (uploading: boolean) => void;
  onError: (error: string) => void;
}) {
  const photoInputRef = useRef<HTMLInputElement>(null);

  async function handlePhotoSelect(files: FileList | null) {
    if (!files || files.length === 0) return;

    const remaining = 10 - photos.length;
    const filesToUpload = Array.from(files).slice(0, remaining);

    for (const file of filesToUpload) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        onError(`"${file.name}" is not a supported image format.`);
        return;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        onError(`"${file.name}" is too large. Maximum size is ${formatFileSize(MAX_IMAGE_SIZE)}.`);
        return;
      }
    }

    onUploadingChange(true);
    onError("");

    try {
      const uploaded: UploadedMedia[] = [];
      for (const file of filesToUpload) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (res.ok) {
          uploaded.push({
            url: data.url,
            filename: data.filename,
            media_type: "image",
            media_source: "upload",
            file_size: data.file_size,
          });
        } else {
          onError(data.error || "Failed to upload image.");
          break;
        }
      }
      onPhotosChange([...photos, ...uploaded]);
    } catch {
      onError("Failed to upload images.");
    }
    onUploadingChange(false);
  }

  function removePhoto(idx: number) {
    onPhotosChange(photos.filter((_, i) => i !== idx));
  }

  return (
    <>
      <input
        ref={photoInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        multiple
        className="hidden"
        onChange={(e) => {
          handlePhotoSelect(e.target.files);
          e.target.value = "";
        }}
      />

      {photos.length < 10 && (
        <button
          type="button"
          onClick={() => photoInputRef.current?.click()}
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
            handlePhotoSelect(e.dataTransfer.files);
          }}
          className="flex w-full items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 py-8 transition-colors hover:border-indigo-300 hover:bg-indigo-50/30"
        >
          {uploading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              Uploading...
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
                  d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v13.5A1.5 1.5 0 0 0 3.75 21Z"
                />
              </svg>
              <p className="mt-2 text-sm font-medium text-gray-500">
                Drag & drop images or click to browse
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Up to 10 images · Max {formatFileSize(MAX_IMAGE_SIZE)} each · JPG, PNG, GIF, WebP
              </p>
            </div>
          )}
        </button>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-5 gap-2">
          {photos.map((photo, idx) => (
            <div key={idx} className="group relative aspect-square overflow-hidden rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={`Uploaded photo ${idx + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(idx)}
                aria-label={`Remove photo ${idx + 1}`}
                className="absolute right-1 top-1 rounded-full bg-black/50 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/70"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
