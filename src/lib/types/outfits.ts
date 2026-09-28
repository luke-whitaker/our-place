// The house armoire: saved outfits and Ghost Mode. An outfit is only clothes
// (shirt, pants, shoes colors); skin and hair belong to the avatar builder.

/** How many outfits one armoire holds. Slots 0 to 4, unique per member. */
export const MAX_OUTFITS = 5;
/** An outfit's optional name, in characters. */
export const OUTFIT_NAME_MAX = 24;

/** The three colors an outfit sets, as hex strings like "#ec4899". */
export interface OutfitColors {
  shirt: string;
  pants: string;
  shoes: string;
}

export interface Outfit extends OutfitColors {
  id: string;
  slot: number;
  /** Blank when the member didn't name it. */
  name: string;
}

/** GET /api/outfits: the armoire's contents, what you're wearing now, and
 * whether Ghost Mode is on. `wearing` is null before a character is built. */
export interface ArmoireContents {
  outfits: Outfit[];
  wearing: OutfitColors | null;
  ghost: boolean;
}
