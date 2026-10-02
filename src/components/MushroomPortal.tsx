import Link from "next/link";
import MushroomIcon from "@/components/MushroomIcon";

/** A gathering's portal into the world, landing beside its planted Event
 * Mushroom. The server only sends `href` to someone who can see the
 * gathering, while the mushroom stands. */
export default function MushroomPortal({ href }: { href: string }) {
  return (
    <Link
      href={href}
      title="Port into the world beside this gathering's Event Mushroom"
      className="flex items-center gap-1 rounded-xl border border-line px-2 py-0.5 text-xs font-medium text-accent-600 hover:bg-accent-50"
    >
      <MushroomIcon size={20} /> Portal
    </Link>
  );
}
