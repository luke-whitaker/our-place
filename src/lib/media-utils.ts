// Video URL parsing utilities (safe for both server and client)

export function getYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export function getVimeoId(url: string): string | null {
  const match = url.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/);
  return match ? match[1] : null;
}

export function parseVideoUrl(url: string): {
  source: "youtube" | "vimeo";
  id: string;
  embedUrl: string;
  thumbnailUrl: string;
} | null {
  const ytId = getYouTubeId(url);
  if (ytId) {
    return {
      source: "youtube",
      id: ytId,
      embedUrl: `https://www.youtube.com/embed/${ytId}`,
      thumbnailUrl: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
    };
  }

  const vimeoId = getVimeoId(url);
  if (vimeoId) {
    return {
      source: "vimeo",
      id: vimeoId,
      embedUrl: `https://player.vimeo.com/video/${vimeoId}`,
      thumbnailUrl: "", // Vimeo requires API call for thumbnails
    };
  }

  return null;
}

const VIDEO_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "vimeo.com",
  "www.vimeo.com",
  "player.vimeo.com",
]);

/**
 * Whether a post may carry this media URL: a file uploaded to our own storage
 * (under `uploadBase`, R2_PUBLIC_BASE_URL), or a YouTube or Vimeo video the
 * player can embed. Anything else is refused at the API, not just by the CSP.
 */
export function isAllowedMediaUrl(url: string, uploadBase: string | undefined): boolean {
  const base = uploadBase?.replace(/\/$/, "");
  if (base && url.startsWith(`${base}/`)) return true;
  // Members paste links as typed ("youtu.be/..." or http), and the player
  // always embeds from the parsed id over https, so only the host matters.
  let parsed: URL;
  try {
    parsed = new URL(url.includes("://") ? url : `https://${url}`);
  } catch {
    return false;
  }
  return (
    (parsed.protocol === "https:" || parsed.protocol === "http:") &&
    VIDEO_HOSTS.has(parsed.hostname) &&
    parseVideoUrl(url) !== null
  );
}

// Accepted file types
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
export const MAX_IMAGES_PER_POST = 10;

// The stored extension comes from the MIME type we validated, never from the
// uploader's filename: the filename is client-controlled, and it once let a
// member write outside images/ (see uploadToStorage's key check).
const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

/** The file extension for an accepted MIME type, or null for anything else. */
export function extensionForType(mimeType: string): string | null {
  return EXTENSION_BY_TYPE[mimeType] ?? null;
}

export function isImageType(mimeType: string): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(mimeType);
}

export function isVideoType(mimeType: string): boolean {
  return ACCEPTED_VIDEO_TYPES.includes(mimeType);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
