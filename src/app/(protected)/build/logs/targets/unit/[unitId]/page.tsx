import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { TargetLogsSection } from "@/components/canonical-logs/target-logs-section";
import { BuildContextBar } from "@/components/build/BuildContextBar";
import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { loadTargetLogsBuildContext } from "@/lib/canonical-logs/load-target-build-context";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";

type Props = { params: Promise<{ unitId: string }> };

export default async function UnitLogsTargetPage({ params }: Props) {
  noStore();
  if (!isCanonicalLogsEnabled()) redirect("/admin/facility/builder");
  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  if (!hasAtLeastRole(session.role, "MANAGER")) redirect("/build");

  const { unitId } = await params;
  const ctx = await loadTargetLogsBuildContext({
    facilityId: session.facilityId,
    targetKind: "UNIT",
    targetId: unitId,
  });
  if (!ctx) notFound();

  return (
    <section className="space-y-4" data-testid="unit-logs-target-page">
      <BuildContextBar
        title={ctx.label.title}
        subtitle="Assigned Logs for this unit"
        facts={[{ value: String(ctx.attachments.length), suffix: "Logs" }]}
      />
      <TargetLogsSection
        targetTitle={ctx.label.title}
        targetSubtitle={ctx.label.subtitle}
        attachments={ctx.attachments}
        addHref={ctx.addHref}
        runHref={`/staffing/logs/targets/unit/${unitId}`}
        departmentName={ctx.departmentName}
      />
    </section>
  );
}
