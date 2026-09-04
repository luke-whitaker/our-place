"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import WorldCanvas from "@/components/WorldCanvas";
import { useAuth } from "@/components/AuthProvider";
import { apiFetch, userMessage } from "@/lib/api-client";
import { CAPITAL } from "@/lib/game/worlds/capital";
import { buildIsland } from "@/lib/game/worlds/island";
import { buildIslandHouse } from "@/lib/game/worlds/island-house";
import { findInterior } from "@/lib/game/worlds/interiors";
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
  who: string;
  info: IslandInfo | null;
  error: string;
}

/** The suffix that turns a place into the room behind its door. */
const INSIDE = "-inside";

function biomeOf(value: unknown) {
  return isTintPreset(value) ? value : "forest";
}

/** The URL for a link's destination, keeping Ports' `?at=` deep-link shape. */
function placeHref(place: string, spawnAt?: string): string {
  const at = spawnAt ? `&at=${encodeURIComponent(spawnAt)}` : "";
  return `/world?place=${encodeURIComponent(place)}${at}`;
}

/** Split `?place=` into whose place it is and whether we want the inside of it.
 * A community room wins over the suffix rule: its slug is a fixed, known id, so
 * `welcome-center-inside` can never be read as a member named `welcome-center`. */
function readPlace(placeParam: string) {
  if (findInterior(placeParam)) return { who: placeParam, inside: false, room: true };
  const inside = placeParam.endsWith(INSIDE);
  return { who: inside ? placeParam.slice(0, -INSIDE.length) : placeParam, inside, room: false };
}

interface ResolveArgs {
  placeParam: string;
  inside: boolean;
  isHome: boolean;
  user: { id: string; username: string; display_name: string; biome?: unknown } | null;
  lookup: VisitLookup | null;
}

/** Resolve `?place=` to the world to render, or null while a visit is still
 * being checked. Community rooms are as public as the buildings they sit in;
 * islands and the houses on them need to know who is looking. */
function resolvePlace({ placeParam, inside, isHome, user, lookup }: ResolveArgs): Place | null {
  const room = findInterior(placeParam);
  if (room) return { world: room, title: room.regions[0].label, visiting: null };
  if (placeParam === "capital") return { world: CAPITAL, title: "The World", visiting: null };
  if (!user) return null;

  if (isHome) {
    const owner = { id: user.id, username: user.username, displayName: user.display_name };
    const world = inside
      ? buildIslandHouse({ owner, isOwn: true })
      : buildIsland({ owner, biome: biomeOf(user.biome), isOwn: true });
    return { world, title: "Home", visiting: null };
  }

  if (!lookup?.info) return null;
  const { owner, biome } = lookup.info;
  const visitor = { id: owner.id, username: owner.username, displayName: owner.display_name };
  // The house follows the island: if the gate let you stand on the doorstep,
  // the door is simply there. No second permission to check.
  const world = inside
    ? buildIslandHouse({ owner: visitor, isOwn: false })
    : buildIsland({ owner: visitor, biome: biomeOf(biome), isOwn: false });
  return {
    world,
    title: inside ? `${owner.display_name}'s Place` : `${owner.display_name}'s Island`,
    visiting: owner.username,
  };
}

function WorldView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();
  // `place` picks the world: the Capital by default, `<slug>-inside` for a
  // community room, `me` or a username for an island, and `me-inside` or
  // `<username>-inside` for the house on it. `at` is what to spawn beside.
  const placeParam = searchParams.get("place") ?? "capital";
  const spawnAt = searchParams.get("at") ?? undefined;
  const { who, inside, room } = readPlace(placeParam);
  const isHome = who === "me" || (!!user && who === user.username);
  // The last visit lookup, tagged with whose island it answered so a stale
  // answer for a previous member is never rendered for the next one.
  const [visit, setVisit] = useState<VisitLookup | null>(null);
  const lookup = visit && visit.who === who ? visit : null;

  // An island needs an account; a community room is as public as its building.
  useEffect(() => {
    if (!loading && !user && !room && placeParam !== "capital") router.replace("/auth/login");
  }, [loading, user, room, placeParam, router]);

  // Someone else's island or house: ask the API whether you may visit, and in
  // which biome. Both share one lookup, keyed on the member, not the place.
  useEffect(() => {
    if (room || who === "capital" || isHome || !user) return;
    let cancelled = false;
    apiFetch<IslandInfo>(`/api/users/${encodeURIComponent(who)}/island`)
      .then((info) => {
        if (!cancelled) setVisit({ who, info, error: "" });
      })
      .catch((err) => {
        if (!cancelled) {
          setVisit({ who, info: null, error: userMessage(err, "That island is out of reach.") });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [who, room, isHome, user]);

  const place = useMemo(
    () => resolvePlace({ placeParam, inside, isHome, user: user ?? null, lookup }),
    [placeParam, inside, isHome, user, lookup],
  );

  function handleDoorInteract(door: Door) {
    // A door that names a world opens it (Ports v2); the rest port to the forum.
    if (door.warpTo) {
      router.push(placeHref(door.warpTo, door.spawnAt));
      return;
    }
    router.push(`/communities/${door.id}`);
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
          onPcPort={(href) => router.push(href)}
          spawnAt={spawnAt}
          persist={place.visiting === null}
        />
      ) : (
        <ClosedIsland error={lookup?.error ?? ""} />
      )}
      <p className="mt-4 text-center text-sm text-ink-faint">
        WASD or arrow keys to move — Enter to use doors, computers, and mushroom shrines
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
