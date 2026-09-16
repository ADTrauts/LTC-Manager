import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { AttachmentEditForm } from "@/components/canonical-logs/attachment-edit-form";
import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import {
  loadCycleOptionsForDepartment,
  loadLogAttachmentForFacility,
  presentLogAttachment,
  cycleLabelMap,
} from "@/lib/canonical-logs";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ attachmentId: string }> };

export default async function AttachmentEditPage({ params }: Props) {
  noStore();
  if (!isCanonicalLogsEnabled()) redirect("/build");
  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  if (!hasAtLeastRole(session.role, "MANAGER")) redirect("/build");

  const { attachmentId } = await params;
  const row = await loadLogAttachmentForFacility(prisma, session.facilityId, attachmentId);
  if (!row) notFound();

  const cycleOptions = await loadCycleOptionsForDepartment(
    prisma,
    session.facilityId,
    row.departmentId,
  );
  const presented = presentLogAttachment({
    row: {
      ...row,
      department: null,
      catalogDefinition: {
        name: row.catalogDefinition.name,
        recommendedCadence: row.catalogDefinition.recommendedCadence,
      },
    },
    cycleLabelByKey: cycleLabelMap(cycleOptions),
    publishedCycleStableKeys: cycleOptions.map((c) => c.stableKey),
  });

  const backHref =
    row.targetKind === "ASSET" && row.assetId
      ? `/build/logs/targets/asset/${row.assetId}`
      : row.targetKind === "SPACE" && row.spaceId
        ? `/build/logs/targets/space/${row.spaceId}`
        : row.targetKind === "UNIT" && row.unitId
          ? `/build/logs/targets/unit/${row.unitId}`
          : row.targetKind === "DEPARTMENT" && row.targetDepartmentId
            ? `/admin/departments/${row.targetDepartmentId}`
            : "/build/logs?tab=attachments";

  return (
    <AttachmentEditForm
      attachmentId={row.id}
      catalogName={row.catalogDefinition.name}
      catalogVersion={row.catalogVersion}
      timingMode={row.timingMode}
      dailyWindows={row.dailyWindows.map((w) => ({
        label: w.label,
        startLocal: w.startLocal,
        endLocal: w.endLocal,
      }))}
      cycleStableKeys={row.cycleSelections.map((c) => c.cycleStableKey)}
      cycleOptions={cycleOptions}
      localDisplayLabel={row.localDisplayLabel}
      localInstructions={row.localInstructions}
      status={row.status}
      needsSetup={presented.needsSetup}
      needsSetupReason={presented.needsSetupReason}
      backHref={backHref}
      allowAdHoc={row.allowAdHoc}
    />
  );
}
