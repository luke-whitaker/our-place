// Loading a world's art: the character sheet (palette-swapped to the member's
// avatar), the ground sheets, and one sprite per object kind the world places,
// all baked through the world's biome tint at load. Shared by the live world
// page and the engine sandbox so the two can never drift apart.

import type { AvatarConfig } from "@/lib/types";
import type { BiomeAssets, IsoAssets } from "./iso-engine";
import type { IsoWorld } from "./world-model";
import { OBJECT_CATALOG } from "./world-model";
import type { WorldFixture } from "./types";
import { FLOWER_COLORS, type FlowerColor } from "./plants";
import { flowerHatPath } from "./flower-hat";
import {
  loadCharacterSheet,
  characterSheetPath,
  loadNpcSheet,
  type NpcSprites,
} from "./character-sheet";
import { loadObjectSprite, type ObjectSprite } from "./world-object";
import { worldAsset, newWorldImage } from "./asset-url";
import { sandSheet, tintImage, tintToImage, type TintPreset } from "./terrain-tint";
import { sandBiomes } from "./sand";
import { NPC_DIALOGUE } from "./npc-dialogue";
import { extraGroundBiomes, extraObjectBiomes } from "./biomes";

/** Every OBJECT_CATALOG key a fixture can render as. A mailbox needs both its
 * raised and lowered art loaded up front, in its own color, so toggling the
 * flag never waits on a fetch — see setMailboxFlag in iso-engine.ts. */
function fixtureSpriteKinds(fixture: WorldFixture): readonly string[] {
  if (fixture.kind === "mailbox") {
    return [`mailbox_${fixture.color}`, `mailbox_${fixture.color}_flag`];
  }
  if (fixture.kind === "plant") return [];
  return [fixture.kind];
}

/** Sprites for things placed at runtime, loaded with every world. */
const RUNTIME_KINDS = [
  "event_mushroom",
  "plant_mound",
  ...FLOWER_COLORS.map((color) => `flower_${color}`),
];

export async function loadWorldAssets(
  world: IsoWorld,
  avatar: AvatarConfig | null = null,
): Promise<IsoAssets> {
  const tint: TintPreset = world.tint ?? "forest";
  // Event Mushrooms, seeds, and flowers are placed while a world is open, so
  // their sprites load with every world rather than waiting to be seen.
  const fixtureKinds = [...(world.fixtures ?? []).flatMap(fixtureSpriteKinds), ...RUNTIME_KINDS];
  const kinds = [...new Set([...world.objects.map((o) => o.kind), ...fixtureKinds])];
  // Every NPC the world places, deduplicated (a future world could repeat one).
  const npcIds = [...new Set((world.npcs ?? []).map((n) => n.id))];
  // An interior names its own ground sheet, painted in the same cell layout, so
  // the autotiler reads it unchanged: `grass` becomes floorboards, `dirt` flags.
  const ground = world.groundSheet ?? "/world/tiles/forest.png";

  const [characters, forest, water, npcSheets, ...sprites] = await Promise.all([
    loadCharacterSheet(worldAsset(characterSheetPath(avatar?.hairStyle)), avatar),
    loadImage(worldAsset(ground)).then((img) => tintToImage(img, tint, "ground")),
    loadImage(worldAsset("/world/tiles/water.png")).then((img) => tintToImage(img, tint, "ground")),
    Promise.all(npcIds.map((id) => loadNpcSheet(worldAsset(NPC_DIALOGUE[id].sheet)))),
    ...kinds.map((kind) => {
      const def = OBJECT_CATALOG[kind];
      return loadObjectSprite(worldAsset(def.src), def.scale, def.anchor).then((sprite) =>
        tintSprite(sprite, tint, def.tint),
      );
    }),
  ]);

  const objects: Record<string, ObjectSprite> = {};
  kinds.forEach((kind, i) => {
    objects[kind] = sprites[i];
  });
  const npcs: Record<string, NpcSprites> = {};
  npcIds.forEach((id, i) => {
    npcs[id] = npcSheets[i];
  });
  const biomes = world.biomes ? await loadBiomeAssets(world, ground) : undefined;
  const sand = await loadSandSheets(world, forest, biomes);
  return { characters, forest, water, objects, npcs, biomes, sand, hats: await loadHats() };
}

/** A sand copy of each biome's ground sheet that has sand in it (or grass
 * beside sand), or undefined for a world without a beach. */
async function loadSandSheets(
  world: IsoWorld,
  base: HTMLImageElement,
  biomes: BiomeAssets | undefined,
): Promise<IsoAssets["sand"]> {
  const presets = sandBiomes(world);
  if (presets.length === 0) return undefined;
  const out: NonNullable<IsoAssets["sand"]> = {};
  await Promise.all(
    presets.map(async (preset) => {
      out[preset] = await sandSheet(biomes?.forest[preset] ?? base);
    }),
  );
  return out;
}

/**
 * Tinted copies for a world that mixes biomes: each extra preset's ground and
 * water sheets, and a sprite for each kind actually placed in that biome. The
 * base preset's art is what loadWorldAssets already built.
 */
async function loadBiomeAssets(world: IsoWorld, ground: string): Promise<BiomeAssets> {
  const [groundImg, waterImg] = await Promise.all([
    loadImage(worldAsset(ground)),
    loadImage(worldAsset("/world/tiles/water.png")),
  ]);
  const out: BiomeAssets = { forest: {}, water: {}, objects: {} };
  await Promise.all(
    extraGroundBiomes(world).map(async (preset) => {
      out.forest[preset] = await tintToImage(groundImg, preset, "ground");
      out.water[preset] = await tintToImage(waterImg, preset, "ground");
    }),
  );
  await Promise.all(
    [...objectBiomesWithMounds(world)].map(async ([preset, kinds]) => {
      const sprites: Record<string, ObjectSprite> = {};
      await Promise.all(
        [...kinds].map(async (kind) => {
          const def = OBJECT_CATALOG[kind];
          const sprite = await loadObjectSprite(worldAsset(def.src), def.scale, def.anchor);
          sprites[kind] = tintSprite(sprite, preset, def.tint);
        }),
      );
      out.objects[preset] = sprites;
    }),
  );
  return out;
}

/** The extra biomes' object kinds, plus a seed mound in every biome the ground
 * uses: a mound can be planted anywhere, and it takes the ground's tint. */
function objectBiomesWithMounds(world: IsoWorld): Map<TintPreset, Set<string>> {
  const pairs = extraObjectBiomes(world);
  for (const preset of extraGroundBiomes(world)) {
    const kinds = pairs.get(preset) ?? new Set<string>();
    kinds.add("plant_mound");
    pairs.set(preset, kinds);
  }
  return pairs;
}

function tintSprite(
  sprite: ObjectSprite,
  tint: TintPreset,
  target: Parameters<typeof tintImage>[2],
): ObjectSprite {
  if (!(sprite.img instanceof HTMLImageElement)) return sprite;
  return { ...sprite, img: tintImage(sprite.img, tint, target) };
}

/** One flower hat per color, untinted: a worn flower keeps its color anywhere. */
async function loadHats(): Promise<Partial<Record<FlowerColor, HTMLImageElement>>> {
  const images = await Promise.all(
    FLOWER_COLORS.map((color) => loadImage(worldAsset(flowerHatPath(color)))),
  );
  const hats: Partial<Record<FlowerColor, HTMLImageElement>> = {};
  FLOWER_COLORS.forEach((color, i) => {
    hats[color] = images[i];
  });
  return hats;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = newWorldImage(src);
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}
