// Server helpers for the house armoire: saved outfits and Ghost Mode. The
// routes under /api/outfits share these so the wire shape, the rate limit
// response, and "wear this" are written once.

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { armoireLimiter } from "@/lib/rate-limit";
import { isAvatarConfig } from "@/lib/game/avatar-recolor";
import type { AvatarConfig, Outfit, OutfitColors } from "@/lib/types";

export const OUTFIT_SELECT = {
  id: true,
  slot: true,
  name: true,
  shirt: true,
  pants: true,
  shoes: true,
} as const;

/** An outfit row, already in its wire shape (the columns match it). */
export function toOutfit(row: Outfit): Outfit {
  return {
    id: row.id,
    slot: row.slot,
    name: row.name,
    shirt: row.shirt,
    pants: row.pants,
    shoes: row.shoes,
  };
}

/** The clothes an avatar is wearing, or null before a character is built. */
export function wearingOf(avatar: unknown): OutfitColors | null {
  if (!isAvatarConfig(avatar)) return null;
  return { shirt: avatar.shirtColor, pants: avatar.pantsColor, shoes: avatar.shoesColor };
}

/** An AvatarConfig as a plain object type: an interface has no index signature,
 * so Prisma's JSON column input won't accept one, while this mapped copy of the
 * same fields it will. */
type AvatarJson = { [K in keyof AvatarConfig]: AvatarConfig[K] };

/** The avatar with an outfit's clothes on. Skin and hair never change. */
export function dressedIn(avatar: AvatarConfig, outfit: OutfitColors): AvatarJson {
  return {
    ...avatar,
    shirtColor: outfit.shirt,
    pantsColor: outfit.pants,
    shoesColor: outfit.shoes,
  };
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
