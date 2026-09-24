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

/** Focused elements that act on Enter or Space themselves. */
const CONTROL_SELECTOR = "a[href], button, input, select, textarea";

/** Whether a key went to a focused link, button, or field rather than the world.
 * Partial because the target can be the window, which has no `matches`. */
function onFocusedControl(e: KeyboardEvent): boolean {
  const target = e.target as Partial<Element> | null;
  return target?.matches?.(CONTROL_SELECTOR) ?? false;
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
    const activates = e.code === "Enter" || e.code === "Space";
    // Enter or Space on a focused link or button is that control's press, and
    // the browser follows it. Reading it here as well did two things at once:
    // with the navbar's 🍄 focused, Enter at a PC flashed the PC and then
    // followed the link out to /world. Movement keys still reach the world.
    if (activates && onFocusedControl(e)) return;
    // Prevent page scroll on arrow keys / space
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
      e.preventDefault();
    }
    // A held Enter or Space auto-repeats about every 50-90 ms after a short
    // delay. Read as fresh presses, those repeats chose the first row of a menu
    // the moment it opened after the confirm flash, so holding Enter at a PC
    // logged you on without ever showing the menu. Arrows keep repeating, so a
    // held arrow still scrolls a menu.
    if (e.repeat && activates) return;
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
