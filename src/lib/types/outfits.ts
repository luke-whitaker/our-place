// The house armoire: saved outfits and Ghost Mode. An outfit is a look: hair
// (style and color) and clothes (shirt, pants, shoes colors). Skin is never
// part of an outfit; it belongs to the avatar builder alone.

/** How many outfits one armoire holds. Slots 0 to 4, unique per member. */
export const MAX_OUTFITS = 5;
/** An outfit's optional name, in characters. */
export const OUTFIT_NAME_MAX = 24;

export const HAIR_STYLES = ["short", "long"] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

/** Everything an outfit sets. Colors are hex strings like "#ec4899". */
export interface OutfitLook {
  hair_style: HairStyle;
  hair_color: string;
  shirt: string;
  pants: string;
  shoes: string;
}

export interface Outfit extends OutfitLook {
  id: string;
  slot: number;
  /** Blank when the member didn't name it. */
  name: string;
}

/** GET /api/outfits: the armoire's contents, what you're wearing now, and
 * whether Ghost Mode is on. `wearing` is null before a character is built. */
export interface ArmoireContents {
  outfits: Outfit[];
  wearing: OutfitLook | null;
  ghost: boolean;
}
