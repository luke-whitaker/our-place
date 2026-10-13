// Removes the metadata a camera writes into a photo (location, time, device)
// before the file is stored at a public address. Lossless: only metadata
// blocks are dropped and the image data is copied byte for byte, so nothing
// is re-encoded. A JPEG keeps its orientation, rebuilt as a one-tag Exif
// block, or phone photos would show sideways. GIF has no standard place for
// location and passes through unchanged.

/** The file isn't the format its type claims, or it is cut short. */
export class ImageMetadataError extends Error {}

/** Bytes backed by a plain ArrayBuffer, which is what fetch accepts as a body. */
type Bytes = Uint8Array<ArrayBuffer>;

export function stripImageMetadata(bytes: Bytes, mimeType: string): Bytes {
  if (mimeType === "image/jpeg") return stripJpeg(bytes);
  if (mimeType === "image/png") return stripPng(bytes);
  if (mimeType === "image/webp") return stripWebp(bytes);
  return bytes;
}

function fail(what: string): never {
  throw new ImageMetadataError(`This ${what} file looks damaged.`);
}

function concat(parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// --- JPEG ---------------------------------------------------------------

const APP1 = 0xe1; // Exif and XMP
const APP13 = 0xed; // Photoshop and IPTC
const COM = 0xfe; // free-text comment
const SOS = 0xda; // start of the image data; everything after it is copied as is

function stripJpeg(bytes: Bytes): Bytes {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) fail("JPEG");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Bytes[] = [bytes.subarray(0, 2)];
  let orientation = 1;
  let orientationAt = -1;
  let at = 2;
  // Bounded: every pass moves `at` forward by at least 1 byte, and the loop
  // ends at the image data or the end of the file.
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) fail("JPEG");
    const marker = bytes[at + 1];
    if (marker === 0xff) {
      at += 1; // fill byte before a marker, allowed by the format
      continue;
    }
    if (marker === SOS) {
      kept.push(bytes.subarray(at));
      if (orientation !== 1) kept.splice(orientationAt, 0, orientationSegment(orientation));
      return concat(kept);
    }
    const end = at + 2 + view.getUint16(at + 2);
    if (end > bytes.length || end < at + 4) fail("JPEG");
    const segment = bytes.subarray(at, end);
    if (marker === APP1) {
      if (orientationAt < 0) orientationAt = kept.length;
      orientation = exifOrientation(segment.subarray(4)) ?? orientation;
    } else if (marker !== APP13 && marker !== COM) {
      kept.push(segment);
    }
    at = end;
  }
  return fail("JPEG");
}

/** The Orientation tag (1 to 8) from an APP1 payload, or null if it has none. */
function exifOrientation(payload: Bytes): number | null {
  const header = "Exif\0\0";
  if (String.fromCharCode(...payload.subarray(0, 6)) !== header) return null;
  const tiff = new DataView(payload.buffer, payload.byteOffset + 6, payload.byteLength - 6);
  if (tiff.byteLength < 8) return null;
  const little = tiff.getUint16(0) === 0x4949;
  const ifd = tiff.getUint32(4, little);
  if (ifd + 2 > tiff.byteLength) return null;
  const count = tiff.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > tiff.byteLength) return null;
    if (tiff.getUint16(entry, little) !== 0x0112) continue;
    const value = tiff.getUint16(entry + 8, little);
    return value >= 1 && value <= 8 ? value : null;
  }
  return null;
}

/** An APP1 Exif segment holding the orientation and nothing else. */
function orientationSegment(orientation: number): Bytes {
  const segment = new Uint8Array(36);
  const view = new DataView(segment.buffer);
  view.setUint16(0, 0xffe1);
  view.setUint16(2, 34); // length, counting itself
  segment.set([0x45, 0x78, 0x69, 0x66, 0, 0], 4); // "Exif\0\0"
  segment.set([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8], 10); // big-endian TIFF, IFD at 8
  view.setUint16(18, 1); // one entry
  view.setUint16(20, 0x0112); // Orientation
  view.setUint16(22, 3); // SHORT
  view.setUint32(24, 1); // one value
  view.setUint16(28, orientation);
  view.setUint32(32, 0); // no next IFD
  return segment;
}

// --- PNG ----------------------------------------------------------------

// eXIf carries Exif (location included); the text chunks carry XMP and notes.
const PNG_DROPPED = new Set(["eXIf", "tEXt", "zTXt", "iTXt"]);

function stripPng(bytes: Bytes): Bytes {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((b, i) => bytes[i] === b)) fail("PNG");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Bytes[] = [bytes.subarray(0, 8)];
  let at = 8;
  // Bounded: every chunk is at least 12 bytes, and the loop stops at IEND.
  while (at + 12 <= bytes.length) {
    const end = at + 12 + view.getUint32(at);
    if (end > bytes.length) fail("PNG");
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (!PNG_DROPPED.has(type)) kept.push(bytes.subarray(at, end));
    if (type === "IEND") return concat(kept);
    at = end;
  }
  return fail("PNG");
}

// --- WebP ---------------------------------------------------------------

const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;

function stripWebp(bytes: Bytes): Bytes {
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WEBP") fail("WebP");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Bytes[] = [];
  let at = 12;
  // Bounded: every chunk is at least 8 bytes.
  while (at + 8 <= bytes.length) {
    const size = view.getUint32(at + 4, true);
    const end = at + 8 + size + (size % 2);
    if (end > bytes.length) fail("WebP");
    const type = tag(at);
    if (type === "VP8X") {
      const chunk = bytes.slice(at, end);
      chunk[8] &= ~(VP8X_EXIF | VP8X_XMP);
      kept.push(chunk);
    } else if (type !== "EXIF" && type !== "XMP ") {
      kept.push(bytes.subarray(at, end));
    }
    at = end;
  }
  const body = concat(kept);
  const header = new Uint8Array(12);
  header.set(bytes.subarray(0, 12));
  new DataView(header.buffer).setUint32(4, body.length + 4, true);
  return concat([header, body]);
}
