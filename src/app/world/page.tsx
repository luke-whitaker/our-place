"use client";

import WorldCanvas from "@/components/WorldCanvas";
import type { Door } from "@/lib/game/types";

export default function WorldPage() {
  function handleDoorInteract(door: Door) {
    // In Phase 2 this will route to /communities/[slug]
    alert(`Entered: ${door.label} (id: ${door.id})`);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 p-2">
      <h1 className="mb-4 text-lg font-bold text-white">Our Place — World Engine Test</h1>
      <WorldCanvas onDoorInteract={handleDoorInteract} />
      <p className="mt-4 text-sm text-gray-400">
        WASD or arrow keys to move — Enter near a door to interact
      </p>
    </div>
  );
}
