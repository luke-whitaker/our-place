import GatheringForm from "@/components/GatheringForm";

// Host a gathering. `?community=<id>` (from a community calendar's "Host a
// gathering") preselects that community.
export default async function NewGatheringPage({
  searchParams,
}: {
  searchParams: Promise<{ community?: string }>;
}) {
  const { community } = await searchParams;
  return <GatheringForm initialCommunityId={community ?? ""} />;
}
