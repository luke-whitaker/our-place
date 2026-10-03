import UnsubscribeConfirm from "@/components/UnsubscribeConfirm";

// Where a gathering email's "Stop emails about gatherings" link lands. Public
// on purpose: the signed token in the link stands in for signing in. Opening
// the page changes nothing; the button does, so a mail scanner following the
// link can't unsubscribe anyone.
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token } = await searchParams;
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="op-card w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-ink">Emails about gatherings</h1>
        <UnsubscribeConfirm token={typeof token === "string" ? token : ""} />
      </div>
    </div>
  );
}
