import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { TargetLogsSection } from "@/components/canonical-logs/target-logs-section";
import { BuildContextBar } from "@/components/build/BuildContextBar";
import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { loadTargetLogsBuildContext } from "@/lib/canonical-logs/load-target-build-context";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";

type Props = { params: Promise<{ spaceId: string }> };

export default async function SpaceLogsTargetPage({ params }: Props) {
  noStore();
  if (!isCanonicalLogsEnabled()) redirect("/admin/facility/builder");
  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  if (!hasAtLeastRole(session.role, "MANAGER")) redirect("/build");

  const { spaceId } = await params;
  const ctx = await loadTargetLogsBuildContext({
    facilityId: session.facilityId,
    targetKind: "SPACE",
    targetId: spaceId,
  });
  if (!ctx) notFound();

  return (
    <section className="space-y-4" data-testid="space-logs-target-page">
      <BuildContextBar
        title={ctx.label.title}
        subtitle="Room / Space Logs"
        facts={[{ value: String(ctx.attachments.length), suffix: "Logs" }]}
      />
      <TargetLogsSection
        targetTitle={ctx.label.title}
        attachments={ctx.attachments}
        addHref={ctx.addHref}
        departmentName={ctx.departmentName}
      />
    </section>
  );
}
