import { describe, it, expect } from "vitest";
import {
  getYouTubeId,
  getVimeoId,
  parseVideoUrl,
  extensionForType,
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_VIDEO_TYPES,
  isImageType,
  isVideoType,
  formatFileSize,
  isAllowedMediaUrl,
} from "./media-utils";

// ── YouTube ID extraction ──

describe("getYouTubeId", () => {
  it("extracts ID from standard watch URL", () => {
    expect(getYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts ID from short URL", () => {
    expect(getYouTubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts ID from embed URL", () => {
    expect(getYouTubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts ID from shorts URL", () => {
    expect(getYouTubeId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("returns null for non-YouTube URL", () => {
    expect(getYouTubeId("https://example.com/video")).toBeNull();
  });
});

// ── Vimeo ID extraction ──

describe("getVimeoId", () => {
  it("extracts ID from standard URL", () => {
    expect(getVimeoId("https://vimeo.com/123456789")).toBe("123456789");
  });

  it("extracts ID from player embed URL", () => {
    expect(getVimeoId("https://player.vimeo.com/video/123456789")).toBe("123456789");
  });

  it("returns null for non-Vimeo URL", () => {
    expect(getVimeoId("https://example.com/video")).toBeNull();
  });
});

// ── parseVideoUrl ──

describe("parseVideoUrl", () => {
  it("returns YouTube result with embed and thumbnail URLs", () => {
    const result = parseVideoUrl("https://youtu.be/dQw4w9WgXcQ");
    expect(result).toEqual({
      source: "youtube",
      id: "dQw4w9WgXcQ",
      embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    });
  });

  it("returns Vimeo result with embed URL", () => {
    const result = parseVideoUrl("https://vimeo.com/123456789");
    expect(result).toEqual({
      source: "vimeo",
      id: "123456789",
      embedUrl: "https://player.vimeo.com/video/123456789",
      thumbnailUrl: "",
    });
  });

  it("returns null for unrecognized URLs", () => {
    expect(parseVideoUrl("https://example.com/video.mp4")).toBeNull();
  });
});

// ── File utilities ──

describe("extensionForType", () => {
  it("maps every accepted type to an extension", () => {
    for (const type of [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES]) {
      expect(extensionForType(type)).toMatch(/^[a-z0-9]+$/);
    }
    expect(extensionForType("image/jpeg")).toBe("jpg");
    expect(extensionForType("video/quicktime")).toBe("mov");
  });

  it("returns null for anything we don't accept", () => {
    expect(extensionForType("image/svg+xml")).toBeNull();
    expect(extensionForType("text/html")).toBeNull();
    expect(extensionForType("")).toBeNull();
  });
});

describe("isImageType", () => {
  it("accepts valid image types", () => {
    expect(isImageType("image/jpeg")).toBe(true);
    expect(isImageType("image/png")).toBe(true);
    expect(isImageType("image/gif")).toBe(true);
    expect(isImageType("image/webp")).toBe(true);
  });

  it("rejects invalid types", () => {
    expect(isImageType("image/svg+xml")).toBe(false);
    expect(isImageType("video/mp4")).toBe(false);
  });
});

describe("isVideoType", () => {
  it("accepts valid video types", () => {
    expect(isVideoType("video/mp4")).toBe(true);
    expect(isVideoType("video/webm")).toBe(true);
    expect(isVideoType("video/quicktime")).toBe(true);
  });

  it("rejects invalid types", () => {
    expect(isVideoType("video/avi")).toBe(false);
    expect(isVideoType("image/png")).toBe(false);
  });
});

describe("formatFileSize", () => {
  it("formats bytes", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("isAllowedMediaUrl", () => {
  const base = "https://pub-media.r2.dev";

  it("accepts files under our upload base, with or without a trailing slash on the base", () => {
    expect(isAllowedMediaUrl(`${base}/images/a.jpg`, base)).toBe(true);
    expect(isAllowedMediaUrl(`${base}/images/a.jpg`, `${base}/`)).toBe(true);
  });

  it("accepts YouTube and Vimeo links as members paste them", () => {
    expect(isAllowedMediaUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ", base)).toBe(true);
    expect(isAllowedMediaUrl("youtu.be/dQw4w9WgXcQ", base)).toBe(true);
    expect(isAllowedMediaUrl("http://vimeo.com/123456", base)).toBe(true);
  });

  it("refuses other hosts, including ones that only mention a video site", () => {
    expect(isAllowedMediaUrl("https://example.com/photo.jpg", base)).toBe(false);
    expect(isAllowedMediaUrl("https://evil.com/?u=youtube.com/watch?v=dQw4w9WgXcQ", base)).toBe(
      false,
    );
    expect(isAllowedMediaUrl("https://pub-media.r2.dev.evil.com/a.jpg", base)).toBe(false);
    expect(isAllowedMediaUrl("javascript:alert(1)", base)).toBe(false);
  });

  it("refuses video-site pages that aren't videos", () => {
    expect(isAllowedMediaUrl("https://www.youtube.com/feed/trending", base)).toBe(false);
  });

  it("refuses uploads when no base is configured", () => {
    expect(isAllowedMediaUrl(`${base}/images/a.jpg`, undefined)).toBe(false);
  });
});
