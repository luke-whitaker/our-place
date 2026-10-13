import { describe, expect, it } from "vitest";
import { ImageMetadataError, stripImageMetadata } from "./image-metadata";

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
const bytes = (...parts: number[][]) => new Uint8Array(parts.flat());
const u16 = (n: number) => [n >> 8, n & 0xff];
const u32 = (n: number) => [...u16(n >>> 16), ...u16(n & 0xffff)];
const u32le = (n: number) => u32(n).reverse();
const contains = (haystack: Uint8Array, text: string) =>
  Buffer.from(haystack).includes(Buffer.from(text, "latin1"));

/** A JPEG segment: marker plus a length that counts itself. */
const segment = (marker: number, payload: number[]) => [
  0xff,
  marker,
  ...u16(payload.length + 2),
  ...payload,
];

/** Exif with an Orientation tag and a GPS pointer, then GPS-looking bytes. */
function exifPayload(orientation: number, littleEndian = false): number[] {
  const short = littleEndian ? (n: number) => u16(n).reverse() : u16;
  const long = littleEndian ? u32le : u32;
  return [
    ...ascii("Exif\0\0"),
    ...(littleEndian ? ascii("II") : ascii("MM")),
    ...short(42),
    ...long(8),
    ...short(2),
    ...short(0x0112),
    ...short(3),
    ...long(1),
    ...short(orientation),
    0,
    0,
    ...short(0x8825),
    ...short(4),
    ...long(1),
    ...long(38),
    ...long(0),
    ...ascii("GPS 41.5868 N 93.6250 W"),
  ];
}

const IMAGE_DATA = [0xff, 0xda, 0, 4, 1, 2, 9, 8, 7, 6, 0xff, 0xd9];

function jpeg(orientation: number, littleEndian = false): Uint8Array<ArrayBuffer> {
  return bytes(
    [0xff, 0xd8],
    segment(0xe0, ascii("JFIF\0")),
    segment(0xe1, exifPayload(orientation, littleEndian)),
    segment(0xe1, ascii("http://ns.adobe.com/xap/1.0/\0<x:GPSLatitude>41.58</x>")),
    segment(0xed, ascii("Photoshop 3.0\0 GPS")),
    segment(0xfe, ascii("GPS comment")),
    segment(0xdb, [0, 1, 2, 3]),
    IMAGE_DATA,
  );
}

/** The orientation in a stripped JPEG's single Exif block, or null if there is none. */
function strippedOrientation(out: Uint8Array): number | null {
  const at = Buffer.from(out).indexOf(Buffer.from([0xff, 0xe1]));
  return at < 0 ? null : (out[at + 28] << 8) | out[at + 29];
}

describe("stripImageMetadata: JPEG", () => {
  it("drops Exif, XMP, IPTC, and comments, keeping the image data byte for byte", () => {
    const out = stripImageMetadata(jpeg(1), "image/jpeg");
    expect(contains(out, "GPS")).toBe(false);
    expect([...out.subarray(0, 2)]).toEqual([0xff, 0xd8]);
    expect(contains(out, "JFIF")).toBe(true);
    expect([...out.subarray(out.length - IMAGE_DATA.length)]).toEqual(IMAGE_DATA);
    expect(strippedOrientation(out)).toBeNull();
  });

  it.each([false, true])("keeps a rotated photo's orientation (little-endian: %s)", (le) => {
    const out = stripImageMetadata(jpeg(6, le), "image/jpeg");
    expect(contains(out, "GPS")).toBe(false);
    expect(strippedOrientation(out)).toBe(6);
  });

  it("puts the orientation where the Exif block was, after JFIF", () => {
    const out = stripImageMetadata(jpeg(8), "image/jpeg");
    const jfif = Buffer.from(out).indexOf(Buffer.from("JFIF"));
    const exif = Buffer.from(out).indexOf(Buffer.from("Exif"));
    expect(jfif).toBeGreaterThan(0);
    expect(exif).toBeGreaterThan(jfif);
  });

  it("refuses a file that isn't a JPEG or is cut short", () => {
    expect(() => stripImageMetadata(bytes(ascii("not a photo")), "image/jpeg")).toThrow(
      ImageMetadataError,
    );
    const cut = jpeg(1).subarray(0, 30);
    expect(() => stripImageMetadata(cut, "image/jpeg")).toThrow(ImageMetadataError);
  });
});

const pngChunk = (type: string, data: number[]) => [
  ...u32(data.length),
  ...ascii(type),
  ...data,
  0,
  0,
  0,
  0,
];

describe("stripImageMetadata: PNG", () => {
  it("drops eXIf and text chunks and keeps the rest", () => {
    const png = bytes(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      pngChunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]),
      pngChunk("eXIf", ascii("MM GPS")),
      pngChunk("iTXt", ascii("XML:com.adobe.xmp GPS")),
      pngChunk("tEXt", ascii("Comment GPS")),
      pngChunk("IDAT", [1, 2, 3]),
      pngChunk("IEND", []),
    );
    const out = stripImageMetadata(png, "image/png");
    expect(contains(out, "GPS")).toBe(false);
    for (const kept of ["IHDR", "IDAT", "IEND"]) expect(contains(out, kept)).toBe(true);
  });

  it("refuses a PNG with no end", () => {
    const png = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], pngChunk("IDAT", [1]));
    expect(() => stripImageMetadata(png, "image/png")).toThrow(ImageMetadataError);
  });
});

const riffChunk = (type: string, data: number[]) => [
  ...ascii(type),
  ...u32le(data.length),
  ...data,
  ...(data.length % 2 ? [0] : []),
];

describe("stripImageMetadata: WebP", () => {
  it("drops EXIF and XMP, clears their flags, and fixes the RIFF size", () => {
    const body = [
      ...ascii("WEBP"),
      ...riffChunk("VP8X", [0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      ...riffChunk("VP8 ", [1, 2, 3]),
      ...riffChunk("EXIF", ascii("GPS data")),
      ...riffChunk("XMP ", ascii("GPS xmp")),
    ];
    const webp = bytes(ascii("RIFF"), u32le(body.length), body);
    const out = stripImageMetadata(webp, "image/webp");
    expect(contains(out, "GPS")).toBe(false);
    expect(out[20]).toBe(0); // VP8X flags
    expect(new DataView(out.buffer).getUint32(4, true)).toBe(out.length - 8);
    expect(contains(out, "VP8 ")).toBe(true);
  });
});

describe("stripImageMetadata: other types", () => {
  it("passes a GIF through unchanged", () => {
    const gif = bytes(ascii("GIF89a"), [1, 2, 3]);
    expect(stripImageMetadata(gif, "image/gif")).toBe(gif);
  });
});
