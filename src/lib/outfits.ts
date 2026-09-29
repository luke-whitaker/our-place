// Server helpers for the house armoire: saved outfits and Ghost Mode. The
// routes under /api/outfits share these so the wire shape, the rate limit
// response, and "wear this" are written once.

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { armoireLimiter } from "@/lib/rate-limit";
import { isAvatarConfig } from "@/lib/game/avatar-recolor";
import { presenceHub } from "@/lib/presence";
import type { AvatarConfig, HairStyle, Outfit, OutfitLook } from "@/lib/types";

export const OUTFIT_SELECT = {
  id: true,
  slot: true,
  name: true,
  hairStyle: true,
  hairColor: true,
  shirt: true,
  pants: true,
  shoes: true,
} as const;

interface OutfitRow {
  id: string;
  slot: number;
  name: string;
  hairStyle: string;
  hairColor: string;
  shirt: string;
  pants: string;
  shoes: string;
}

/** Only "short" and "long" are ever written; anything else reads as long, the
 * style every existing member kept. */
function hairStyleOf(value: string): HairStyle {
  return value === "short" ? "short" : "long";
}

/** An outfit row in its wire shape. */
export function toOutfit(row: OutfitRow): Outfit {
  return {
    id: row.id,
    slot: row.slot,
    name: row.name,
    hair_style: hairStyleOf(row.hairStyle),
    hair_color: row.hairColor,
    shirt: row.shirt,
    pants: row.pants,
    shoes: row.shoes,
  };
}

interface LookColumns {
  hairStyle: string;
  hairColor: string;
  shirt: string;
  pants: string;
  shoes: string;
}

/** A look's columns, for creating an outfit row (every part) or updating one
 * (only the parts sent; Prisma skips an undefined column). */
export function lookColumns(look: OutfitLook): LookColumns;
export function lookColumns(look: Partial<OutfitLook>): Partial<LookColumns>;
export function lookColumns(look: Partial<OutfitLook>): Partial<LookColumns> {
  return {
    hairStyle: look.hair_style,
    hairColor: look.hair_color,
    shirt: look.shirt,
    pants: look.pants,
    shoes: look.shoes,
  };
}

/** The look an avatar is wearing, or null before a character is built. */
export function wearingOf(avatar: unknown): OutfitLook | null {
  if (!isAvatarConfig(avatar)) return null;
  return {
    hair_style: avatar.hairStyle,
    hair_color: avatar.hairColor,
    shirt: avatar.shirtColor,
    pants: avatar.pantsColor,
    shoes: avatar.shoesColor,
  };
}

/** An AvatarConfig as a plain object type: an interface has no index signature,
 * so Prisma's JSON column input won't accept one, while this mapped copy of the
 * same fields it will. */
type AvatarJson = { [K in keyof AvatarConfig]: AvatarConfig[K] };

/** The avatar wearing a look. Skin never changes: it is copied from the avatar
 * as it is, and no look carries it. */
export function dressedIn(avatar: AvatarConfig, look: OutfitLook): AvatarJson {
  return {
    hairStyle: look.hair_style,
    hairColor: look.hair_color,
    skinTone: avatar.skinTone,
    shirtColor: look.shirt,
    pantsColor: look.pants,
    shoesColor: look.shoes,
  };
}

/**
 * Put a look on the caller: into their avatar, so everything that draws the
 * avatar just works, and out of Ghost Mode, since getting dressed ends it.
 * Anyone nearby sees the change at once. A ready 409 before a character is
 * built, since there is no skin to keep yet.
 */
export async function wearLook(
  userId: string,
  look: OutfitLook,
): Promise<{ avatar: AvatarJson; error?: never } | { avatar?: never; error: Response }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatar: true } });
  if (!isAvatarConfig(user?.avatar)) {
    return {
      error: NextResponse.json(
        { error: "Build your character first, then try on an outfit." },
        { status: 409 },
      ),
    };
  }

  const avatar = dressedIn(user.avatar, look);
  await prisma.user.update({ where: { id: userId }, data: { avatar, ghost: false } });

  // Avatar first, while a ghost is still hidden, so coming back into view
  // shows the new look rather than the old one for a moment.
  const hub = presenceHub();
  hub.setAvatar(userId, avatar);
  hub.setGhost(userId, false);
  return { avatar };
}

/** A ready 429, or null when the member may change their armoire again. */
export function armoireRateLimited(userId: string): Response | null {
  const limit = armoireLimiter.check(userId);
  if (limit.allowed) return null;
  return NextResponse.json(
    { error: "That's a lot of changing. Give it a moment." },
    { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
  );
}

/** The member's own outfit, or null if it isn't theirs or doesn't exist. */
export function findOwnOutfit(userId: string, id: string) {
  return prisma.outfit.findFirst({ where: { id, ownerId: userId }, select: OUTFIT_SELECT });
}
