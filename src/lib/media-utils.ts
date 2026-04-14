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

// Accepted file types
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
export const MAX_IMAGES_PER_POST = 10;

export function getFileExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  // Normalize .mov to .mp4 extension mapping isn't needed here,
  // just return the actual extension
  return ext;
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
