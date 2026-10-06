/**
 * Domain projection of Preventive Maintenance context on a Work Order.
 * Not a visual design. Used by existing Work Order load/list.
 */

import { type CivilDate, parseCivilDate } from "./civil-date";

export type WorkOrderPmContext = {
  occurrenceId: string;
  planId?: string;
  planName: string;
  scheduledDate: CivilDate;
  occurrenceStatus?: string;
  categoryLabel?: string | null;
  procedureLabel?: string | null;
  requirementLabels?: string[];
  assetName?: string | null;
};

export function presentPmWorkOrderContext(input: {
  workOrderKind?: string | null;
  pmOccurrence?: {
    id: string;
    scheduledDate: Date | string;
    status?: string;
    planId?: string;
    plan?: { asset?: { name: string } | null } | null;
    planVersion?: {
      name: string;
      maintenanceCategory?: { label: string } | null;
      procedureVersion?: { version: number; title: string; article?: { title: string } | null } | null;
      recordRequirements?: Array<{ templateName: string }>;
    } | null;
  } | null;
}): WorkOrderPmContext | null {
  if (input.workOrderKind !== "PREVENTIVE" || !input.pmOccurrence) return null;
  const planName = input.pmOccurrence.planVersion?.name?.trim();
  if (!planName) return null;
  const procedure = input.pmOccurrence.planVersion?.procedureVersion;
  return {
    occurrenceId: input.pmOccurrence.id,
    planId: input.pmOccurrence.planId,
    planName,
    scheduledDate: parseCivilDate(input.pmOccurrence.scheduledDate),
    occurrenceStatus: input.pmOccurrence.status,
    categoryLabel: input.pmOccurrence.planVersion?.maintenanceCategory?.label ?? null,
    procedureLabel: procedure
      ? `${procedure.article?.title || procedure.title} v${procedure.version}`
      : null,
    requirementLabels:
      input.pmOccurrence.planVersion?.recordRequirements?.map((row) => row.templateName) ?? [],
    assetName: input.pmOccurrence.plan?.asset?.name ?? null,
  };
}
