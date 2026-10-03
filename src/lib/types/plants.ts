// Seeds and flowers placed in a world: the API's snake_case wire shapes.

import type { FlowerColor } from "@/lib/game/plants";
import type { PocketItem } from "./items";

/** One seed or flower standing in a world. `color` is null until a seed
 * blooms: the server never sends it before then. */
export interface PlantWire {
  id: string;
  col: number;
  row: number;
  owner: { username: string; display_name: string };
  mine: boolean;
  color: FlowerColor | null;
}

/** GET /api/world/plants?world= */
export interface PlantsInWorld {
  plants: PlantWire[];
}

/** DELETE /api/world/plants/[id]: what came back into pockets. */
export interface PickedPlant {
  message: string;
  items: PocketItem[];
}

/** GET /api/hat: the flower on the caller's head, or null. */
export interface WornHat {
  hat: PocketItem | null;
}
