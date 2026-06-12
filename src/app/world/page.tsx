"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import WorldCanvas from "@/components/WorldCanvas";
import type { Door } from "@/lib/game/types";

function WorldView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Portal deep-link: /world?at=<door id> spawns at that building
  const spawnAt = searchParams.get("at") ?? undefined;

  function handleDoorInteract(door: Door) {
    // Doors port you back to the forum view of that place
    if (door.id === "my-place") {
      router.push("/profile");
    } else {
      router.push(`/communities/${door.id}`);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-inverse p-2">
      <h1 className="mb-4 text-lg font-bold text-ink-inverse">The World</h1>
      <WorldCanvas onDoorInteract={handleDoorInteract} spawnAt={spawnAt} />
      <p className="mt-4 text-center text-sm text-ink-faint">
        WASD or arrow keys to move — Enter to use doors and mushroom shrines
      </p>
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
