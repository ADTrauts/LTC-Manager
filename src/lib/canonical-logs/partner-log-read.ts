import type { PrismaClient } from "@prisma/client";

import { canPartner } from "@/lib/partner-user-access";
import type { PartnerOperationalContext } from "@/lib/partner-operational-context";

import { loadDepartmentScopedRunLogRecordView } from "./load-run-log-record";
import { loadFacilityRunLogRequirements } from "./load-run-requirements";
import type { RunAdHocAttachmentView, RunLogRequirementView, UpcomingRunLogView } from "./run-presentation";

type Db = PrismaClient;

export type PartnerRunLogRead = {
  operationalDateKey: string;
  requirements: RunLogRequirementView[];
  adHocAttachments: RunAdHocAttachmentView[];
  upcoming: UpcomingRunLogView[];
  timezone: string;
};

function assertPartnerLogRead(context: PartnerOperationalContext): string {
  if (!canPartner(context.effectiveRole, "logs.read")) {
    throw new Error("Partner Log reads require logs.read.");
  }
  const departmentId = context.activeDepartmentId;
  if (!departmentId || !context.allowedDepartmentIds.includes(departmentId)) {
    throw new Error("Partner Log reads require a Department.");
  }
  return departmentId;
}

function partnerReadLinks(requirement: RunLogRequirementView): RunLogRequirementView {
  return {
    ...requirement,
    openHref: null,
    primaryActionLabel: null,
    buildSettingsHref: null,
    viewRecordHref: requirement.recordId ? `/partner/logs/records/${requirement.recordId}` : null,
  };
}

/**
 * Canonical RUN Log list for the active partner Department.
 * Calls the shared loader with a required Department. Does not duplicate requirement rules.
 */
export async function loadPartnerRunLogRequirements(input: {
  client: Db;
  context: PartnerOperationalContext;
  now?: Date;
}): Promise<PartnerRunLogRead> {
  const departmentId = assertPartnerLogRead(input.context);
  const bundle = await loadFacilityRunLogRequirements({
    client: input.client,
    facilityId: input.context.facilityId,
    departmentId,
    partnerRead: true,
    now: input.now,
  });
  return {
    operationalDateKey: bundle.operationalDateKey,
    requirements: bundle.requirements.map(partnerReadLinks),
    adHocAttachments: bundle.adHocAttachments.map((row) => ({ ...row, startHref: null })),
    upcoming: bundle.upcoming,
    timezone: bundle.timezone,
  };
}

/**
 * One canonical record in the active Department and current Facility.
 * The query includes both ids. A miss is not found. This does not switch Departments.
 */
export async function loadPartnerRunLogRecord(input: {
  client: Db;
  context: PartnerOperationalContext;
  recordId: string;
}) {
  const departmentId = assertPartnerLogRead(input.context);
  return loadDepartmentScopedRunLogRecordView({
    client: input.client,
    facilityId: input.context.facilityId,
    departmentId,
    recordId: input.recordId,
  });
}
