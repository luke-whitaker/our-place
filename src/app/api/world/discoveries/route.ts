import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { discoveriesLimiter } from "@/lib/rate-limit";
import { discoveriesWorldSchema, getZodErrorMessage, mergeDiscoveriesSchema } from "@/lib/schemas";
import { mappedWorld } from "@/lib/game/mapped-worlds";
import { decodeVisited } from "@/lib/game/map-chunks";
import { mergeDiscoveries, readDiscoveries } from "@/lib/discoveries";

function noMap() {
  return NextResponse.json({ error: "That world has no map." }, { status: 400 });
}

// GET: what the caller has found in a world with a map: the chunks they've
// walked and the shrines they've discovered. Only ever their own.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = discoveriesWorldSchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }
    const world = mappedWorld(parsed.data.world);
    if (!world) return noMap();

    const discoveries = await readDiscoveries(auth.user.userId, {
      id: parsed.data.world,
      grid: world.grid,
    });
    return NextResponse.json(discoveries);
  } catch (error) {
    console.error("Read discoveries error:", error);
    return NextResponse.json({ error: "Failed to load your map." }, { status: 500 });
  }
}

// POST: merge what this device found into the caller's discoveries. Only adds:
// visited chunks are OR-ed in and shrines unioned, so repeats are harmless.
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;

    const limit = discoveriesLimiter.check(me);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many map saves. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const parsed = mergeDiscoveriesSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }
    const world = mappedWorld(parsed.data.world);
    if (!world) return noMap();

    const visited =
      parsed.data.visited === undefined ? null : decodeVisited(parsed.data.visited, world.grid);
    if (parsed.data.visited !== undefined && !visited) {
      return NextResponse.json({ error: "That map doesn't fit this world." }, { status: 400 });
    }
    const shrines = parsed.data.shrines ?? [];
    const unknown = shrines.find((id) => !world.shrines.includes(id));
    if (unknown) {
      return NextResponse.json(
        { error: `There's no shrine called "${unknown}".` },
        { status: 400 },
      );
    }

    const merged = await mergeDiscoveries(
      me,
      { id: parsed.data.world, grid: world.grid },
      visited,
      shrines,
    );
    return NextResponse.json(merged);
  } catch (error) {
    console.error("Save discoveries error:", error);
    return NextResponse.json({ error: "Failed to save your map." }, { status: 500 });
  }
}
