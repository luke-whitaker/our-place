// Our Place's own mushroom, the same art as the app icon, marking every door
// into the world and the brand mark on the front and login pages. 28px is its
// native size and 56px an exact double, so both stay crisp; 20px lets the
// browser smooth it so it sits beside button text.
export default function MushroomIcon({ size = 28 }: { size?: 20 | 28 | 56 }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a tiny pixel-art icon, not a Next-optimized photo
    <img
      src="/icons/mushroom.png"
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={size === 20 ? undefined : "[image-rendering:pixelated]"}
    />
  );
}
