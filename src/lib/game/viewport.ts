// Canvas sizing: how big the <canvas> element is in CSS px, and how that maps
// to backing-store device px and to the span of world visible through it.
//
// The old scheme scaled a fixed 960x640 canvas down with CSS on small screens
// (WorldCanvas's "Responsive scaling" effect), which shrank the HUD text along
// with everything else — on a 390px phone the canvas rendered at about 374x249
// CSS px, putting 10px HUD text at under 4 CSS px. This module instead sizes the
// canvas to the screen first (fitCanvas) and derives an integer device-px-per-
// world-px scale from that (computeViewport), so the HUD always draws at real
// CSS px and the world layer always draws at a crisp integer zoom.

/** Narrowest span of world (pre-zoom px) a view may show across, about nine
 * tiles. Below this the world reads as a postage stamp; computeViewport backs
 * the zoom off toward 1x rather than cropping further. */
export const MIN_VIEW_W = 288;

/** CSS pixels per world pixel on a wide screen: today's desktop look. */
export const MAX_CSS_ZOOM = 2;

export interface Viewport {
  /** Canvas size in CSS px; the HUD lays out in these. */
  cssW: number;
  cssH: number;
  /** Device px per CSS px. */
  dpr: number;
  /** Device px per world px. An integer so pixel art stays crisp. */
  worldScale: number;
  /** World span visible, pre-zoom px. */
  viewW: number;
  viewH: number;
}

/**
 * Derive the render scale and visible world span for a canvas of the given CSS
 * size on a screen of the given device pixel ratio.
 *
 * The CSS zoom (CSS px per world px) shrinks below MAX_CSS_ZOOM once the canvas
 * is narrower than MIN_VIEW_W at that zoom, so a phone shows more world rather
 * than a sliver of it at a fixed size. worldScale then rounds that zoom (times
 * dpr) to the nearest whole device pixel — never zero — because nearest-neighbour
 * art blurs at a fractional scale. viewW/viewH fall out of the backing-store
 * size divided by that integer scale, so the world layer exactly fills the
 * canvas with no seam at the edge.
 */
export function computeViewport(cssW: number, cssH: number, dpr: number): Viewport {
  const cssZoom = Math.min(MAX_CSS_ZOOM, cssW / MIN_VIEW_W);
  const worldScale = Math.max(1, Math.round(cssZoom * dpr));
  const viewW = Math.round(cssW * dpr) / worldScale;
  const viewH = Math.round(cssH * dpr) / worldScale;
  return { cssW, cssH, dpr, worldScale, viewW, viewH };
}

/**
 * The canvas's CSS size given the space available for it.
 *
 * Touch devices (`fill`) take all the space offered, in either orientation,
 * limited only to between 1:2 and 5:2 so a phone never gets a sliver. The world
 * has no fixed aspect, so a tall canvas just shows more rows. Mouse/keyboard
 * devices keep the classic 3:2 letterbox, capped at the original 960x640 so
 * desktop is unchanged.
 */
export function fitCanvas(
  availW: number,
  availH: number,
  fill: boolean,
): { cssW: number; cssH: number } {
  if (fill) {
    const cssH = Math.floor(Math.min(availH, availW * 2));
    const cssW = Math.floor(Math.min(availW, cssH * 2.5));
    return { cssW: Math.max(1, cssW), cssH: Math.max(1, cssH) };
  }
  const cssW = Math.floor(Math.min(availW, 960, availH * 1.5));
  const cssH = Math.floor((cssW * 2) / 3);
  return { cssW: Math.max(1, cssW), cssH: Math.max(1, cssH) };
}
