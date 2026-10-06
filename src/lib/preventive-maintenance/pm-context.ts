/**
 * Domain projection of Preventive Maintenance context on a Work Order.
 * Not a visual design. Used by existing Work Order load/list.
 */

import { type CivilDate, parseCivilDate } from "./civil-date";

export type WorkOrderPmContext = {
  occurrenceId: string;
  planName: string;
  scheduledDate: CivilDate;
};

export function presentPmWorkOrderContext(input: {
  workOrderKind?: string | null;
  pmOccurrence?: {
    id: string;
    scheduledDate: Date | string;
    planVersion?: { name: string } | null;
  } | null;
}): WorkOrderPmContext | null {
  if (input.workOrderKind !== "PREVENTIVE" || !input.pmOccurrence) return null;
  const planName = input.pmOccurrence.planVersion?.name?.trim();
  if (!planName) return null;
  return {
    occurrenceId: input.pmOccurrence.id,
    planName,
    scheduledDate: parseCivilDate(input.pmOccurrence.scheduledDate),
  };
}
