import { CanonicalTargetRunLogsPage } from "@/components/canonical-logs/canonical-target-run-page";

type Props = { params: Promise<{ spaceId: string }> };

export default async function SpaceRunLogsPage({ params }: Props) {
  const { spaceId } = await params;
  return (
    <CanonicalTargetRunLogsPage
      target={{ kind: "SPACE", id: spaceId }}
      subtitle="Room"
      testId="space-run-logs-page"
    />
  );
}
