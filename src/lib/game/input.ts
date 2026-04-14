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
}

export function createInputManager(): InputManager {
  const keys: Record<string, boolean> = {};

  function onKeyDown(e: KeyboardEvent) {
    // Prevent page scroll on arrow keys / space
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
      e.preventDefault();
    }
    keys[e.code] = true;
  }

  function onKeyUp(e: KeyboardEvent) {
    keys[e.code] = false;
  }

  return {
    isDown(code: string) {
      return !!keys[code];
    },

    consume(code: string) {
      if (keys[code]) {
        keys[code] = false;
        return true;
      }
      return false;
    },

    press(code: string) {
      keys[code] = true;
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
  };
}
