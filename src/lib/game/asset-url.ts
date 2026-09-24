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

/**
 * The deployed commit, appended to production art URLs. `npm run world:upload`
 * replaces art in place under the same names, and the bucket sends no
 * Cache-Control, so browsers kept an old sheet for days after an upload: the
 * blush stayed on long hair after v0.10.4 shipped. A new query string on every
 * deploy makes each browser fetch the current art once (672 KB in all).
 */
function artVersion(): string {
  return (process.env.NEXT_PUBLIC_ART_VERSION || "").slice(0, 12);
}

/** Resolve a root-relative `/world/...` path to its served URL. */
export function worldAsset(path: string): string {
  const base = assetBase();
  if (!base) return path;
  const url = path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
  const version = artVersion();
  return version ? `${url}?v=${version}` : url;
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
