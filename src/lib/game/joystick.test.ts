import { describe, it, expect } from "vitest";
import { joystickKeys, JOYSTICK_DEAD_ZONE } from "./joystick";

const RADIUS = 100;

/** A stick offset at the given screen-space angle (0 = right, 90 = down, clockwise
 * because screen y grows downward) and distance from center. */
function polar(angleDeg: number, distance: number): { dx: number; dy: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { dx: Math.cos(rad) * distance, dy: Math.sin(rad) * distance };
}

describe("joystickKeys", () => {
  it("maps each of the eight directions to its arrow keys", () => {
    const cases: Array<[number, string[]]> = [
      [0, ["ArrowRight"]],
      [45, ["ArrowDown", "ArrowRight"]],
      [90, ["ArrowDown"]],
      [135, ["ArrowDown", "ArrowLeft"]],
      [180, ["ArrowLeft"]],
      [-135, ["ArrowUp", "ArrowLeft"]],
      [-90, ["ArrowUp"]],
      [-45, ["ArrowUp", "ArrowRight"]],
    ];
    for (const [angle, keys] of cases) {
      const { dx, dy } = polar(angle, RADIUS);
      expect(joystickKeys(dx, dy, RADIUS)).toEqual(keys);
    }
  });

  it("holds no key inside the dead zone", () => {
    const { dx, dy } = polar(-90, RADIUS * JOYSTICK_DEAD_ZONE - 1);
    expect(joystickKeys(dx, dy, RADIUS)).toEqual([]);
  });

  it("holds a direction right at the dead zone's edge", () => {
    const { dx, dy } = polar(0, RADIUS * JOYSTICK_DEAD_ZONE);
    expect(joystickKeys(dx, dy, RADIUS)).toEqual(["ArrowRight"]);
  });

  it("picks the nearer sector just either side of a 22.5-degree boundary", () => {
    // The East/Northeast boundary sits at -22.5 degrees.
    const towardEast = polar(-22.5 + 1, RADIUS);
    expect(joystickKeys(towardEast.dx, towardEast.dy, RADIUS)).toEqual(["ArrowRight"]);

    const towardNortheast = polar(-22.5 - 1, RADIUS);
    expect(joystickKeys(towardNortheast.dx, towardNortheast.dy, RADIUS)).toEqual([
      "ArrowUp",
      "ArrowRight",
    ]);
  });

  it("still maps by angle when dragged past the stick's radius", () => {
    const { dx, dy } = polar(90, RADIUS * 3);
    expect(joystickKeys(dx, dy, RADIUS)).toEqual(["ArrowDown"]);
  });
});
