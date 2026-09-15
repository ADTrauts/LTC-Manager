import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { TargetLogsSection } from "@/components/canonical-logs/target-logs-section";
import { BuildContextBar } from "@/components/build/BuildContextBar";
import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { loadTargetLogsBuildContext } from "@/lib/canonical-logs/load-target-build-context";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";

type Props = {
  params: Promise<{ assetId: string }>;
};

export default async function AssetLogsTargetPage({ params }: Props) {
  noStore();
  if (!isCanonicalLogsEnabled()) redirect("/assets/builder");
  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  if (!hasAtLeastRole(session.role, "MANAGER")) redirect("/assets");

  const { assetId } = await params;
  const ctx = await loadTargetLogsBuildContext({
    facilityId: session.facilityId,
    targetKind: "ASSET",
    targetId: assetId,
  });
  if (!ctx) notFound();

  return (
    <section className="space-y-4" data-testid="asset-logs-target-page">
      <BuildContextBar
        title={ctx.label.title}
        subtitle={ctx.label.subtitle ?? "Asset Logs"}
        facts={[
          { value: String(ctx.attachments.length), suffix: "Logs" },
          ...(ctx.departmentName
            ? [{ value: ctx.departmentName, prefix: "Department:" }]
            : []),
        ]}
      />
      <TargetLogsSection
        targetTitle={ctx.label.title}
        targetSubtitle={ctx.label.subtitle}
        attachments={ctx.attachments}
        addHref={ctx.addHref}
        departmentName={ctx.departmentName}
      />
    </section>
  );
}
