// Our Place's own mushroom, the same art as the app icon, marking every door
// into the world. 28px is its native size and stays crisp; smaller sizes let
// the browser smooth it so it sits beside button text.
export default function MushroomIcon({ size = 28 }: { size?: 20 | 28 }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a tiny pixel-art icon, not a Next-optimized photo
    <img
      src="/icons/mushroom.png"
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={size === 28 ? "[image-rendering:pixelated]" : undefined}
    />
  );
}
