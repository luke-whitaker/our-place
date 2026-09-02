import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { uploadLimiter } from "@/lib/rate-limit";
import { v4 as uuidv4 } from "uuid";
import {
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_VIDEO_TYPES,
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
  isImageType,
  isVideoType,
  getFileExtension,
} from "@/lib/media-utils";
import { StorageConfigError, StorageUploadError, uploadToStorage } from "@/lib/storage";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: "Please log in to upload files." }, { status: 401 });
    }
    if (!auth.is_verified) {
      return NextResponse.json({ error: "Please verify your account first." }, { status: 403 });
    }

    const limit = uploadLimiter.check(auth.userId);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many uploads. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const mimeType = file.type;
    const isImage = isImageType(mimeType);
    const isVideo = isVideoType(mimeType);

    if (!isImage && !isVideo) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${mimeType}. Accepted: ${[...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES].join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Validate file size
    const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
    if (file.size > maxSize) {
      const limitMB = maxSize / (1024 * 1024);
      return NextResponse.json(
        { error: `File too large. Maximum size is ${limitMB}MB.` },
        { status: 400 },
      );
    }

    // Object key mirrors the old /uploads/<subdir>/<uuid>.<ext> layout
    const subDir = isImage ? "images" : "videos";
    const ext = getFileExtension(file.name) || (isImage ? "jpg" : "mp4");
    const key = `${subDir}/${uuidv4()}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const url = await uploadToStorage(key, arrayBuffer, mimeType);

    return NextResponse.json({
      url,
      filename: file.name,
      media_type: isImage ? "image" : "video",
      file_size: file.size,
      mime_type: mimeType,
    });
  } catch (error) {
    console.error("Upload error:", error);

    // Say which half broke. A single opaque 500 for both a missing env var and
    // a rejected object turns every upload failure into a log-diving exercise.
    if (error instanceof StorageConfigError) {
      return NextResponse.json(
        { error: "File storage is not configured on this server." },
        { status: 503 },
      );
    }
    if (error instanceof StorageUploadError) {
      return NextResponse.json(
        { error: `File storage rejected the upload (${error.status}).` },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: "Failed to upload file." }, { status: 500 });
  }
}
