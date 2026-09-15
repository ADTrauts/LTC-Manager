import { notFound, redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";

import { CanonicalLogEntryForm } from "@/components/canonical-logs/canonical-log-entry-form";
import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { resolveAttachmentTargetLabel } from "@/lib/canonical-logs/target-labels";
import {
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ attachmentId: string }> };

export default async function AdHocCanonicalLogPage({ params }: Props) {
  noStore();
  if (!isCanonicalLogsEnabled()) redirect("/logs");

  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  if (!hasAtLeastRole(session.role, "STAFF")) redirect("/workspace");

  const { attachmentId } = await params;
  const attachment = await prisma.logAttachment.findFirst({
    where: {
      id: attachmentId,
      facilityId: session.facilityId,
      status: "ACTIVE",
      timingMode: "AD_HOC",
    },
    include: {
      catalogDefinition: {
        include: { fields: { orderBy: { displaySequence: "asc" } } },
      },
    },
  });
  if (!attachment) notFound();

  const timezone = await loadFacilityTimezone(prisma, session.facilityId);
  const operationalDateKey = toServiceDateKey(getFacilityServiceDate(timezone));
  const target =
    (await resolveAttachmentTargetLabel(prisma, {
      facilityId: session.facilityId,
      targetKind: attachment.targetKind,
      assetId: attachment.assetId,
      spaceId: attachment.spaceId,
      unitId: attachment.unitId,
      targetDepartmentId: attachment.targetDepartmentId,
    }))?.title ?? "Target";

  const catalogName = attachment.catalogDefinition.name;
  const displayName = attachment.localDisplayLabel?.trim() || catalogName;

  return (
    <section className="mx-auto max-w-xl px-3 py-4" data-testid="adhoc-log-form">
      <CanonicalLogEntryForm
        facilityId={session.facilityId}
        departmentId={attachment.departmentId}
        attachmentId={attachment.id}
        operationalDateKey={operationalDateKey}
        displayName={displayName}
        catalogDefinitionName={catalogName}
        targetLabel={target}
        timingContextLabel="As needed"
        catalogInstructions={attachment.catalogDefinition.instructions}
        localInstructions={attachment.localInstructions}
        fields={attachment.catalogDefinition.fields.map((f) => ({
          fieldKey: f.fieldKey,
          label: f.label,
          fieldType: f.fieldType,
          isRequired: f.isRequired,
          displaySequence: f.displaySequence,
          helpText: f.helpText,
          unitLabel: f.unitLabel,
          minNumber: f.minNumber,
          maxNumber: f.maxNumber,
          allowedSelections: f.allowedSelections,
          correctiveActionTrigger: f.correctiveActionTrigger,
          correctiveActionRequired: f.correctiveActionRequired,
        }))}
        requirementKey={null}
        cycleStableKey={null}
        cycleLabel={null}
        windowStartLocal={null}
        windowEndLocal={null}
        adHoc
        cancelHref="/staffing/logs"
      />
    </section>
  );
}
