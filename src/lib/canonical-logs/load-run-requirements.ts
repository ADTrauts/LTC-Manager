/**
 * Load today's canonical Log requirements for RUN.
 */

import type { PrismaClient } from "@prisma/client";

import { hasAtLeastRole } from "@/lib/access";
import type { AppJwtPayload } from "@/lib/auth";
import { isCanonicalLogsEnabled } from "@/lib/feature-flags";
import {
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { resolveCycleWindowInstants } from "@/lib/operational-cycles/cycle-windows";

import { loadCycleOptionsForDepartment } from "./cycle-options";
import {
  resolveLogRequirementsForAttachment,
  type PublishedCycleForLogs,
} from "./resolve-log-requirements";
import { resolveAttachmentTargetLabel } from "./target-labels";
import {
  presentRunLogRequirement,
  type RunAdHocAttachmentView,
  type RunLogRequirementView,
} from "./run-presentation";

type Db = PrismaClient;

export async function loadFacilityRunLogRequirements(input: {
  client: Db;
  session: AppJwtPayload;
  facilityId: string;
  departmentId: string;
  now?: Date;
}): Promise<{
  operationalDateKey: string;
  requirements: RunLogRequirementView[];
  adHocAttachments: RunAdHocAttachmentView[];
  timezone: string;
}> {
  if (!isCanonicalLogsEnabled()) {
    return {
      operationalDateKey: toServiceDateKey(new Date()),
      requirements: [],
      adHocAttachments: [],
      timezone: "UTC",
    };
  }

  const now = input.now ?? new Date();
  const timezone = await loadFacilityTimezone(input.client, input.facilityId);
  const operationalDateKey = toServiceDateKey(getFacilityServiceDate(timezone, now));
  const isManager = hasAtLeastRole(input.session.role, "MANAGER");

  const attachments = await input.client.logAttachment.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      status: "ACTIVE",
    },
    include: {
      dailyWindows: { orderBy: { displaySequence: "asc" } },
      cycleSelections: { orderBy: { displaySequence: "asc" } },
      catalogDefinition: {
        include: { fields: { orderBy: { displaySequence: "asc" } } },
      },
    },
  });

  const cycleOptions = await loadCycleOptionsForDepartment(
    input.client,
    input.facilityId,
    input.departmentId,
    now,
  );

  // Load published cycle windows for the operational date.
  const cycleRows = await input.client.departmentOperationalCycle.findMany({
    where: {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      status: "PUBLISHED",
      nodeKind: "PERIOD",
      effectiveFrom: { lte: new Date(`${operationalDateKey}T00:00:00.000Z`) },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gte: new Date(`${operationalDateKey}T00:00:00.000Z`) } },
      ],
    },
    select: {
      stableKey: true,
      label: true,
      startLocal: true,
      endLocal: true,
      overnight: true,
    },
  });

  const publishedCycles: PublishedCycleForLogs[] = [];
  for (const row of cycleRows) {
    if (!row.startLocal || !row.endLocal) continue;
    const instants = resolveCycleWindowInstants({
      operationalDateKey,
      startLocal: row.startLocal,
      endLocal: row.endLocal,
      overnight: row.overnight,
      facilityTimezone: timezone,
    });
    if (!instants) continue;
    publishedCycles.push({
      stableKey: row.stableKey,
      label: row.label,
      startLocal: row.startLocal,
      endLocal: row.endLocal,
      overnight: row.overnight,
      startsAt: instants.startsAt,
      endsAt: instants.endsAt,
    });
  }

  const attachmentIds = attachments.map((a) => a.id);
  const existingRecords =
    attachmentIds.length === 0
      ? []
      : await input.client.operationalEvidenceRecord.findMany({
          where: {
            facilityId: input.facilityId,
            departmentId: input.departmentId,
            operationalDate: new Date(`${operationalDateKey}T00:00:00.000Z`),
            logAttachmentId: { in: attachmentIds },
          },
          select: {
            id: true,
            requirementKey: true,
            logRequirementKey: true,
            status: true,
          },
        });

  const requirements: RunLogRequirementView[] = [];
  const adHocAttachments: RunAdHocAttachmentView[] = [];

  for (const attachment of attachments) {
    const targetLabel =
      (
        await resolveAttachmentTargetLabel(input.client, {
          facilityId: input.facilityId,
          targetKind: attachment.targetKind,
          assetId: attachment.assetId,
          spaceId: attachment.spaceId,
          unitId: attachment.unitId,
          targetDepartmentId: attachment.targetDepartmentId,
        })
      )?.title ?? "Target";

    if (attachment.timingMode === "AD_HOC") {
      const catalogName = attachment.catalogDefinition.name;
      adHocAttachments.push({
        attachmentId: attachment.id,
        departmentId: attachment.departmentId,
        displayName: attachment.localDisplayLabel?.trim() || catalogName,
        catalogDefinitionName: catalogName,
        targetLabel,
        startHref: `/staffing/logs/adhoc/${attachment.id}`,
      });
      continue;
    }

    const resolved = resolveLogRequirementsForAttachment({
      attachment: {
        ...attachment,
        catalogDefinition: {
          id: attachment.catalogDefinition.id,
          name: attachment.catalogDefinition.name,
          purposeType: attachment.catalogDefinition.purposeType,
          instructions: attachment.catalogDefinition.instructions,
          status: attachment.catalogDefinition.status,
          fields: attachment.catalogDefinition.fields.map((f) => ({
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
          })),
        },
      },
      operationalDateKey,
      now,
      facilityTimezone: timezone,
      publishedCycles,
      existingRecords,
    });

    for (const req of resolved) {
      // Hide Needs setup from non-managers (frontline shouldn't repair BUILD).
      if (req.productState === "NEEDS_SETUP" && !isManager) continue;

      requirements.push(
        presentRunLogRequirement({
          requirement: req,
          catalogDefinitionName: attachment.catalogDefinition.name,
          localDisplayLabel: attachment.localDisplayLabel,
          localInstructions: attachment.localInstructions,
          catalogInstructions: attachment.catalogDefinition.instructions,
          targetLabel,
          isManager,
        }),
      );
    }
  }

  void cycleOptions;

  return { operationalDateKey, requirements, adHocAttachments, timezone };
}

export async function loadRunLogRequirementByKey(input: {
  client: Db;
  session: AppJwtPayload;
  facilityId: string;
  attachmentId: string;
  requirementKey: string;
  now?: Date;
}): Promise<RunLogRequirementView | null> {
  const attachment = await input.client.logAttachment.findFirst({
    where: { id: input.attachmentId, facilityId: input.facilityId },
    select: { departmentId: true },
  });
  if (!attachment) return null;

  const bundle = await loadFacilityRunLogRequirements({
    client: input.client,
    session: input.session,
    facilityId: input.facilityId,
    departmentId: attachment.departmentId,
    now: input.now,
  });

  return bundle.requirements.find((r) => r.requirementKey === input.requirementKey) ?? null;
}
