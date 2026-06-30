// Where world art is served from.
//
// Sprites live at root-relative /world/... paths. In development they're served
// from public/world/ (local dev copies). In production the packs are gitignored
// (license: no redistribution), so they aren't in the build — they're uploaded to
// object storage and served from there, exactly like user media.
//
// Set NEXT_PUBLIC_WORLD_ASSET_BASE to the R2 public base (or a CDN/custom domain)
// to switch the engine over; leave it empty to use the local copies.

function assetBase(): string {
  // Read at call time so tests can stub it; NEXT_PUBLIC_* is inlined at build for
  // client bundles either way.
  return (process.env.NEXT_PUBLIC_WORLD_ASSET_BASE || "").replace(/\/$/, "");
}

/** Resolve a root-relative `/world/...` path to its served URL. */
export function worldAsset(path: string): string {
  const base = assetBase();
  if (!base) return path;
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

/**
 * A fresh <img> set up to load world art. For cross-origin (R2/CDN) URLs it
 * enables CORS so canvas pixel reads don't taint — `world-object.ts` alpha-scans
 * each sprite via getImageData to find its ground anchor, which throws on a
 * tainted canvas. Same-origin dev art needs neither (and setting crossOrigin
 * there would be harmless but pointless). The bucket must send CORS headers
 * allowing the app origin for the cross-origin case to load at all.
 */
export function newWorldImage(url: string): HTMLImageElement {
  const img = new Image();
  if (/^https?:\/\//i.test(url)) img.crossOrigin = "anonymous";
  return img;
}
