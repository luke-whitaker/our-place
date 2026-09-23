/**
 * Keyboard + touch input manager.
 * Stores pressed key state in a plain object for fast per-tick reads.
 */

export interface InputManager {
  /** Check if a key is currently held down */
  isDown: (code: string) => boolean;
  /** Consume a key press (returns true once, then clears) */
  consume: (code: string) => boolean;
  /** Simulate a key press (for touch D-pad) */
  press: (code: string) => void;
  /** Simulate a key release (for touch D-pad) */
  release: (code: string) => void;
  /** Attach keyboard event listeners — returns cleanup function */
  attach: () => () => void;
  /** Forget presses nothing consumed. The game loop calls this after every tick. */
  endTick: () => void;
}

export function createInputManager(): InputManager {
  const keys: Record<string, boolean> = {};
  // Keys pressed since the last tick. A tap can go down and back up between two
  // ticks, from a quick finger or a main-thread stall that delivers both events
  // back to back, and `keys` alone would already read false by the time the
  // tick looks. Cleared by endTick, so a press nobody consumed never fires later
  // at the next door. Bounded by the handful of key codes in use.
  const pressedSinceTick = new Set<string>();

  function down(code: string) {
    keys[code] = true;
    pressedSinceTick.add(code);
  }

  function onKeyDown(e: KeyboardEvent) {
    // Prevent page scroll on arrow keys / space
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
      e.preventDefault();
    }
    down(e.code);
  }

  function onKeyUp(e: KeyboardEvent) {
    keys[e.code] = false;
  }

  return {
    isDown(code: string) {
      return !!keys[code];
    },

    consume(code: string) {
      if (keys[code] || pressedSinceTick.has(code)) {
        keys[code] = false;
        pressedSinceTick.delete(code);
        return true;
      }
      return false;
    },

    press(code: string) {
      down(code);
    },

    release(code: string) {
      keys[code] = false;
    },

    attach() {
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);

      return () => {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
      };
    },

    endTick() {
      pressedSinceTick.clear();
    },
  };
}
