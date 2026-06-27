import IsoLab from "@/components/IsoLab";

// Dev harness for the isometric renderer slice — not linked from anywhere and
// safe to delete once the iso engine replaces the live world. See IsoLab.tsx.
export default function IsoLabPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-inverse p-2">
      <h1 className="text-lg font-bold text-ink-inverse">Iso Lab</h1>
      <IsoLab />
    </div>
  );
}
