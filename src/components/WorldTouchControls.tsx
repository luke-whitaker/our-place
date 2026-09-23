"use client";

import { useEffect, useRef, useState } from "react";
import { joystickKeys } from "@/lib/game/joystick";

interface WorldTouchControlsProps {
  /** Simulate a key going down (the same codes the keyboard sends). */
  onPress: (code: string) => void;
  /** Simulate a key coming back up. */
  onRelease: (code: string) => void;
}

/** Stick base and knob diameters, in px. The knob clamps to the base's radius,
 * and joystickKeys measures its dead zone against that same radius. */
const BASE_SIZE = 128;
const KNOB_SIZE = 56;
const RADIUS = BASE_SIZE / 2;

/**
 * <WorldTouchControls /> — the touch joystick and A button shown over the
 * canvas on touch devices. The joystick maps its offset to up to two arrow
 * keys (joystickKeys) so a thumb can walk the Capital's diagonal streets
 * without zigzagging between four separate buttons.
 *
 * onPress/onRelease fire only on a change in the held key set: the engine's
 * menus step once per press, so a stick held steady in one direction must not
 * repeat that press every frame.
 */
export default function WorldTouchControls({ onPress, onRelease }: WorldTouchControlsProps) {
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const heldRef = useRef<Set<string>>(new Set());
  const activePointerRef = useRef<number | null>(null);
  const centerRef = useRef({ x: 0, y: 0 });

  // Read through a ref so the pointer handlers below stay plain functions
  // (a handler factory would read the ref during render, which the hooks
  // lint forbids) and so an unmount can release without depending on props.
  const callbacksRef = useRef({ onPress, onRelease });
  useEffect(() => {
    callbacksRef.current = { onPress, onRelease };
  }, [onPress, onRelease]);

  useEffect(() => {
    // Capture the set now: the cleanup runs after unmount, and the lint rule
    // wants a stable reference rather than a read of the ref at that point.
    // It's the same mutable Set either way, so this only satisfies the rule.
    const held = heldRef.current;
    return () => {
      for (const code of held) callbacksRef.current.onRelease(code);
      held.clear();
    };
  }, []);

  function applyKeys(next: string[]) {
    const held = heldRef.current;
    const { onPress: press, onRelease: release } = callbacksRef.current;
    const nextSet = new Set(next);
    for (const code of held) {
      if (nextSet.has(code)) continue;
      held.delete(code);
      release(code);
    }
    for (const code of nextSet) {
      if (held.has(code)) continue;
      held.add(code);
      press(code);
    }
  }

  function releaseAll() {
    applyKeys([]);
    setKnobOffset({ x: 0, y: 0 });
  }

  function updateFromPoint(clientX: number, clientY: number) {
    const dx = clientX - centerRef.current.x;
    const dy = clientY - centerRef.current.y;
    applyKeys(joystickKeys(dx, dy, RADIUS));

    const distance = Math.hypot(dx, dy);
    const clamped = Math.min(distance, RADIUS);
    const scale = distance === 0 ? 0 : clamped / distance;
    setKnobOffset({ x: dx * scale, y: dy * scale });
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointerRef.current = e.pointerId;
    const rect = e.currentTarget.getBoundingClientRect();
    centerRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    updateFromPoint(e.clientX, e.clientY);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerId !== activePointerRef.current) return;
    e.preventDefault();
    updateFromPoint(e.clientX, e.clientY);
  }

  function handlePointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerId !== activePointerRef.current) return;
    activePointerRef.current = null;
    releaseAll();
  }

  function pressA(e: React.TouchEvent<HTMLButtonElement>) {
    e.preventDefault();
    callbacksRef.current.onPress("Enter");
  }

  function releaseA(e: React.TouchEvent<HTMLButtonElement>) {
    e.preventDefault();
    callbacksRef.current.onRelease("Enter");
  }

  return (
    <div className="fixed bottom-6 left-0 right-0 z-30 flex items-end justify-between px-6 pointer-events-none">
      <div
        className="relative touch-none select-none rounded-full border border-white/20 bg-surface/10 pointer-events-auto"
        style={{ width: BASE_SIZE, height: BASE_SIZE, WebkitTouchCallout: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={handlePointerEnd}
      >
        <div
          className="absolute rounded-full border border-white/30 bg-surface/30"
          style={{
            width: KNOB_SIZE,
            height: KNOB_SIZE,
            left: "50%",
            top: "50%",
            transform: `translate(-50%, -50%) translate(${knobOffset.x}px, ${knobOffset.y}px)`,
          }}
        />
      </div>

      <button
        className="h-16 w-16 select-none rounded-full border-2 border-white/25 bg-surface/10 text-lg font-bold text-ink-inverse pointer-events-auto active:bg-surface/25"
        onTouchStart={pressA}
        onTouchEnd={releaseA}
        onTouchCancel={releaseA}
      >
        A
      </button>
    </div>
  );
}
