// Loading a world's art: the character sheet (palette-swapped to the member's
// avatar), the ground sheets, and one sprite per object kind the world places,
// all baked through the world's biome tint at load. Shared by the live world
// page and the engine sandbox so the two can never drift apart.

import type { AvatarConfig } from "@/lib/types";
import type { IsoAssets } from "./iso-engine";
import type { IsoWorld } from "./world-model";
import { OBJECT_CATALOG } from "./world-model";
import { loadCharacterSheet } from "./character-sheet";
import { loadObjectSprite, type ObjectSprite } from "./world-object";
import { worldAsset, newWorldImage } from "./asset-url";
import { tintImage, tintToImage, type TintPreset } from "./terrain-tint";

export async function loadWorldAssets(
  world: IsoWorld,
  avatar: AvatarConfig | null = null,
): Promise<IsoAssets> {
  const tint: TintPreset = world.tint ?? "forest";
  const kinds = [...new Set(world.objects.map((o) => o.kind))];

  const [characters, forest, water, ...sprites] = await Promise.all([
    loadCharacterSheet(worldAsset("/world/characters/long.png"), avatar),
    loadImage(worldAsset("/world/tiles/forest.png")).then((img) =>
      tintToImage(img, tint, "ground"),
    ),
    loadImage(worldAsset("/world/tiles/water.png")).then((img) => tintToImage(img, tint, "ground")),
    ...kinds.map((kind) => {
      const def = OBJECT_CATALOG[kind];
      return loadObjectSprite(worldAsset(def.src), def.scale).then((sprite) =>
        tintSprite(sprite, tint, def.tint),
      );
    }),
  ]);

  const objects: Record<string, ObjectSprite> = {};
  kinds.forEach((kind, i) => {
    objects[kind] = sprites[i];
  });
  return { characters, forest, water, objects };
}

function tintSprite(
  sprite: ObjectSprite,
  tint: TintPreset,
  target: Parameters<typeof tintImage>[2],
): ObjectSprite {
  if (!(sprite.img instanceof HTMLImageElement)) return sprite;
  return { ...sprite, img: tintImage(sprite.img, tint, target) };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = newWorldImage(src);
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}
