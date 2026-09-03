"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import WorldCanvas from "@/components/WorldCanvas";
import { useAuth } from "@/components/AuthProvider";
import { apiFetch, userMessage } from "@/lib/api-client";
import { CAPITAL } from "@/lib/game/worlds/capital";
import { buildIsland, ISLAND_DOOR_ID } from "@/lib/game/worlds/island";
import { isTintPreset } from "@/lib/game/terrain-tint";
import type { IsoWorld } from "@/lib/game/world-model";
import type { Door, WorldLink } from "@/lib/game/types";
import type { IslandInfo } from "@/lib/types";

/** A resolved place: the world to render, whose it is, and whether to save. */
interface Place {
  world: IsoWorld;
  title: string;
  /** The island owner's username when visiting; null for the Capital and home. */
  visiting: string | null;
}

interface VisitLookup {
  place: string;
  info: IslandInfo | null;
  error: string;
}

function biomeOf(value: unknown) {
  return isTintPreset(value) ? value : "forest";
}

/** The URL for a link's destination, keeping Ports' `?at=` deep-link shape. */
function placeHref(place: string, spawnAt?: string): string {
  const at = spawnAt ? `&at=${encodeURIComponent(spawnAt)}` : "";
  return `/world?place=${encodeURIComponent(place)}${at}`;
}

function WorldView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();
  // `place` picks the world: the Capital by default, `me` for your island, or
  // a username to visit theirs. `at` is a door or shrine to spawn beside.
  const placeParam = searchParams.get("place") ?? "capital";
  const spawnAt = searchParams.get("at") ?? undefined;
  const isHome = placeParam === "me" || (!!user && placeParam === user.username);
  // The last visit lookup, tagged with the place it answered so a stale answer
  // for a previous island is never rendered for the next one.
  const [visit, setVisit] = useState<VisitLookup | null>(null);
  const lookup = visit && visit.place === placeParam ? visit : null;

  // Your island needs an account; a link there while logged out goes to login.
  useEffect(() => {
    if (!loading && !user && placeParam !== "capital") router.replace("/auth/login");
  }, [loading, user, placeParam, router]);

  // Someone else's island: ask the API whether you may visit, and in which biome.
  useEffect(() => {
    if (placeParam === "capital" || isHome || !user) return;
    let cancelled = false;
    const place = placeParam;
    apiFetch<IslandInfo>(`/api/users/${encodeURIComponent(place)}/island`)
      .then((info) => {
        if (!cancelled) setVisit({ place, info, error: "" });
      })
      .catch((err) => {
        if (!cancelled) {
          setVisit({ place, info: null, error: userMessage(err, "That island is out of reach.") });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [placeParam, isHome, user]);

  const place = useMemo((): Place | null => {
    if (placeParam === "capital") return { world: CAPITAL, title: "The World", visiting: null };
    if (!user) return null;
    if (isHome) {
      const owner = { id: user.id, username: user.username, displayName: user.display_name };
      const world = buildIsland({ owner, biome: biomeOf(user.biome), isOwn: true });
      return { world, title: "Home", visiting: null };
    }
    if (!lookup?.info) return null;
    const { owner, biome } = lookup.info;
    const world = buildIsland({
      owner: { id: owner.id, username: owner.username, displayName: owner.display_name },
      biome: biomeOf(biome),
      isOwn: false,
    });
    return { world, title: `${owner.display_name}'s Island`, visiting: owner.username };
  }, [placeParam, isHome, user, lookup]);

  function handleDoorInteract(door: Door) {
    // Doors port you back to the forum view of that place.
    if (door.id === ISLAND_DOOR_ID) {
      router.push(place?.visiting ? `/profile/${place.visiting}` : "/profile");
    } else {
      router.push(`/communities/${door.id}`);
    }
  }

  function handleWorldLink(link: WorldLink) {
    router.push(placeHref(link.place, link.spawnAt));
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-inverse p-2">
      <h1 className="mb-4 text-lg font-bold text-ink-inverse">{place?.title ?? "The World"}</h1>
      {place ? (
        <WorldCanvas
          key={place.world.id}
          world={place.world}
          onDoorInteract={handleDoorInteract}
          onWorldLink={handleWorldLink}
          spawnAt={spawnAt}
          persist={place.visiting === null}
        />
      ) : (
        <ClosedIsland error={lookup?.error ?? ""} />
      )}
      <p className="mt-4 text-center text-sm text-ink-faint">
        WASD or arrow keys to move — Enter to use doors and mushroom shrines
      </p>
    </div>
  );
}

/** Shown while a visit resolves, or when the owner has closed their island. */
function ClosedIsland({ error }: { error: string }) {
  return (
    <div className="flex h-64 w-full max-w-xl flex-col items-center justify-center gap-3 rounded-lg border-2 border-line-inverse text-center">
      {error ? (
        <>
          <p className="px-6 font-mono text-sm text-ink-faint">{error}</p>
          <Link href="/world" className="font-mono text-sm text-accent-400 hover:underline">
            Back to the Capital
          </Link>
        </>
      ) : (
        <p className="animate-pulse font-mono text-sm text-ink-faint">Finding the island...</p>
      )}
    </div>
  );
}

export default function WorldPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-surface-inverse" />
      }
    >
      <WorldView />
    </Suspense>
  );
}
