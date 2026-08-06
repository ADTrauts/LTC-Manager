/**
 * Authoritative server-side Evidence Requirement resolver (Phase 9C).
 * Pure / batched — no per-employee queries. Draft templates never appear.
 * Retired templates are not prospective. Future windows are never late/not-confirmed.
 */

import type {
  OperationalEvidenceRecordStatus,
  OperationalTemplateScheduleKind,
  SpaceType,
} from "@prisma/client";

import { resolveCycleWindowInstants } from "@/lib/operational-cycles/cycle-windows";

import { buildRequirementKey } from "./requirement-key";
import type {
  EvidenceRequirement,
  EvidenceRequirementState,
  ExistingEvidenceRecordForResolve,
  PublishedCycleWindowForResolve,
  PublishedTemplateForResolve,
  TemplateFieldSnapshot,
} from "./types";

export type AssetScopeForResolve = {
  id: string;
  equipmentType: string | null;
  unitId?: string | null;
};

export type SpaceScopeForResolve = {
  id: string;
  spaceType: SpaceType;
  unitId?: string | null;
};

export type ResolveEvidenceRequirementsInput = {
  facilityId: string;
  departmentId: string;
  operationalDateKey: string;
  now: Date;
  facilityTimezone?: string | null;
  unitId?: string | null;
  /** Preloaded assets in scope (batched). */
  assets?: readonly AssetScopeForResolve[];
  /** Preloaded spaces in scope (batched). */
  spaces?: readonly SpaceScopeForResolve[];
  /** Published templates only — caller must filter drafts/retired. */
  publishedTemplates: readonly PublishedTemplateForResolve[];
  /** Published cycle windows for the operational date (for OPERATIONAL_CYCLE schedules). */
  publishedCycles: readonly PublishedCycleWindowForResolve[];
  existingRecords: readonly ExistingEvidenceRecordForResolve[];
  pendingOfflineKeys?: readonly string[];
  synchronizingKeys?: readonly string[];
  conflictKeys?: readonly string[];
};

type ScopeTarget = {
  unitId: string | null;
  spaceId: string | null;
  assetId: string | null;
  assetType: string | null;
  spaceType: SpaceType | null;
};

function stateLabel(state: EvidenceRequirementState): string {
  switch (state) {
    case "UPCOMING":
      return "Upcoming";
    case "DUE":
      return "Due";
    case "COMPLETED":
      return "Completed";
    case "COMPLETED_WITH_CORRECTIVE_ACTION":
      return "Completed with Corrective Action";
    case "NEEDS_REVIEW":
      return "Needs Review";
    case "NOT_CONFIRMED":
      return "Record Not Submitted";
    case "NOT_APPLICABLE":
      return "Not Applicable";
    case "NOT_CONFIGURED":
      return "Not Configured";
    case "SAVED_ON_THIS_TABLET":
      return "Saved on This Tablet";
    case "SYNCHRONIZING":
      return "Synchronizing";
    case "CONFLICT_REVIEW":
      return "Conflict Review";
  }
}

function recordState(
  status: OperationalEvidenceRecordStatus,
): Extract<
  EvidenceRequirementState,
  "COMPLETED" | "COMPLETED_WITH_CORRECTIVE_ACTION" | "NEEDS_REVIEW"
> {
  if (status === "COMPLETED_WITH_CORRECTIVE_ACTION") return "COMPLETED_WITH_CORRECTIVE_ACTION";
  if (status === "NEEDS_REVIEW") return "NEEDS_REVIEW";
  return "COMPLETED";
}

function expandApplicability(
  template: PublishedTemplateForResolve,
  input: ResolveEvidenceRequirementsInput,
): ScopeTarget[] {
  const apps = template.applicabilities;
  if (apps.length === 0) {
    return [
      {
        unitId: input.unitId ?? null,
        spaceId: null,
        assetId: null,
        assetType: null,
        spaceType: null,
      },
    ];
  }

  const assets = input.assets ?? [];
  const spaces = input.spaces ?? [];
  const targets: ScopeTarget[] = [];

  for (const app of apps) {
    switch (app.kind) {
      case "SPECIFIC_ASSET": {
        if (!app.assetId) break;
        if (input.unitId) {
          const asset = assets.find((a) => a.id === app.assetId);
          if (asset?.unitId && asset.unitId !== input.unitId) break;
        }
        if (assets.length > 0 && !assets.some((a) => a.id === app.assetId)) break;
        targets.push({
          unitId: input.unitId ?? null,
          spaceId: null,
          assetId: app.assetId,
          assetType: null,
          spaceType: null,
        });
        break;
      }
      case "ASSET_TYPE": {
        if (!app.assetType?.trim()) break;
        const typeKey = app.assetType.trim().toUpperCase();
        const matching = assets.filter(
          (a) => (a.equipmentType ?? "").trim().toUpperCase() === typeKey,
        );
        if (matching.length === 0) {
          // Keep a typed placeholder so Builder preview can show the requirement shape.
          if (!input.assets || input.assets.length === 0) {
            targets.push({
              unitId: input.unitId ?? null,
              spaceId: null,
              assetId: null,
              assetType: app.assetType,
              spaceType: null,
            });
          }
          break;
        }
        for (const asset of matching) {
          if (input.unitId && asset.unitId && asset.unitId !== input.unitId) continue;
          targets.push({
            unitId: asset.unitId ?? input.unitId ?? null,
            spaceId: null,
            assetId: asset.id,
            assetType: app.assetType,
            spaceType: null,
          });
        }
        break;
      }
      case "SPECIFIC_SPACE": {
        if (!app.spaceId) break;
        if (spaces.length > 0 && !spaces.some((s) => s.id === app.spaceId)) break;
        targets.push({
          unitId: input.unitId ?? null,
          spaceId: app.spaceId,
          assetId: null,
          assetType: null,
          spaceType: null,
        });
        break;
      }
      case "SPACE_TYPE": {
        if (!app.spaceType) break;
        const matching = spaces.filter((s) => s.spaceType === app.spaceType);
        if (matching.length === 0) {
          if (!input.spaces || input.spaces.length === 0) {
            targets.push({
              unitId: input.unitId ?? null,
              spaceId: null,
              assetId: null,
              assetType: null,
              spaceType: app.spaceType,
            });
          }
          break;
        }
        for (const space of matching) {
          if (input.unitId && space.unitId && space.unitId !== input.unitId) continue;
          targets.push({
            unitId: space.unitId ?? input.unitId ?? null,
            spaceId: space.id,
            assetId: null,
            assetType: null,
            spaceType: app.spaceType,
          });
        }
        break;
      }
      case "DEPARTMENT_UNIT": {
        if (!app.unitId) break;
        if (input.unitId && input.unitId !== app.unitId) break;
        targets.push({
          unitId: app.unitId,
          spaceId: null,
          assetId: null,
          assetType: null,
          spaceType: null,
        });
        break;
      }
    }
  }

  return targets;
}

type ResolvedWindow = {
  scheduleKind: OperationalTemplateScheduleKind;
  cycleStableKey: string | null;
  cycleLabel: string | null;
  windowStartLocal: string | null;
  windowEndLocal: string | null;
  windowStartsAt: Date | null;
  windowEndsAt: Date | null;
  configured: boolean;
};

function resolveScheduleWindows(
  template: PublishedTemplateForResolve,
  input: ResolveEvidenceRequirementsInput,
): ResolvedWindow[] {
  const schedules = template.schedules;
  if (schedules.length === 0) {
    if (template.allowAdHoc) {
      return [
        {
          scheduleKind: "AD_HOC",
          cycleStableKey: null,
          cycleLabel: null,
          windowStartLocal: null,
          windowEndLocal: null,
          windowStartsAt: null,
          windowEndsAt: null,
          configured: true,
        },
      ];
    }
    return [
      {
        scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
        cycleStableKey: null,
        cycleLabel: null,
        windowStartLocal: null,
        windowEndLocal: null,
        windowStartsAt: null,
        windowEndsAt: null,
        configured: false,
      },
    ];
  }

  const out: ResolvedWindow[] = [];
  for (const schedule of schedules) {
    if (schedule.kind === "OPERATIONAL_CYCLE") {
      const cycle = input.publishedCycles.find((c) => c.stableKey === schedule.cycleStableKey);
      if (!cycle) {
        out.push({
          scheduleKind: "OPERATIONAL_CYCLE",
          cycleStableKey: schedule.cycleStableKey,
          cycleLabel: null,
          windowStartLocal: null,
          windowEndLocal: null,
          windowStartsAt: null,
          windowEndsAt: null,
          configured: false,
        });
        continue;
      }
      out.push({
        scheduleKind: "OPERATIONAL_CYCLE",
        cycleStableKey: cycle.stableKey,
        cycleLabel: cycle.label,
        windowStartLocal: cycle.startLocal,
        windowEndLocal: cycle.endLocal,
        windowStartsAt: cycle.startsAt,
        windowEndsAt: cycle.endsAt,
        configured: true,
      });
      continue;
    }

    if (schedule.kind === "FIXED_DAILY_WINDOW") {
      const window = resolveCycleWindowInstants({
        operationalDateKey: input.operationalDateKey,
        startLocal: schedule.windowStartLocal ?? "",
        endLocal: schedule.windowEndLocal ?? "",
        overnight: false,
        facilityTimezone: input.facilityTimezone,
      });
      out.push({
        scheduleKind: "FIXED_DAILY_WINDOW",
        cycleStableKey: null,
        cycleLabel: null,
        windowStartLocal: schedule.windowStartLocal,
        windowEndLocal: schedule.windowEndLocal,
        windowStartsAt: window?.startsAt ?? null,
        windowEndsAt: window?.endsAt ?? null,
        configured: Boolean(window),
      });
      continue;
    }

    // ONCE_PER_OPERATIONAL_DATE / AD_HOC — whole operational day is the due window when configured.
    const dayStart = resolveCycleWindowInstants({
      operationalDateKey: input.operationalDateKey,
      startLocal: "00:00",
      endLocal: "23:59",
      overnight: false,
      facilityTimezone: input.facilityTimezone,
    });
    out.push({
      scheduleKind: schedule.kind,
      cycleStableKey: null,
      cycleLabel: null,
      windowStartLocal: schedule.kind === "ONCE_PER_OPERATIONAL_DATE" ? "00:00" : null,
      windowEndLocal: schedule.kind === "ONCE_PER_OPERATIONAL_DATE" ? "23:59" : null,
      windowStartsAt: dayStart?.startsAt ?? null,
      windowEndsAt: dayStart?.endsAt ?? null,
      configured: true,
    });
  }
  return out;
}

function deriveTemporalState(input: {
  now: Date;
  windowStartsAt: Date | null;
  windowEndsAt: Date | null;
  scheduleKind: OperationalTemplateScheduleKind;
}): EvidenceRequirementState {
  const { now, windowStartsAt, windowEndsAt, scheduleKind } = input;

  if (scheduleKind === "AD_HOC") {
    return "DUE";
  }

  if (!windowStartsAt || !windowEndsAt) {
    return "NOT_CONFIGURED";
  }

  if (now < windowStartsAt) return "UPCOMING";
  if (now <= windowEndsAt) return "DUE";
  return "NOT_CONFIRMED";
}

function buildRequirement(input: {
  template: PublishedTemplateForResolve;
  scope: ScopeTarget;
  window: ResolvedWindow;
  operationalDateKey: string;
  now: Date;
  recordsByKey: Map<string, ExistingEvidenceRecordForResolve>;
  pending: Set<string>;
  synchronizing: Set<string>;
  conflicts: Set<string>;
}): EvidenceRequirement {
  const { template, scope, window, operationalDateKey } = input;
  const requirementKey = buildRequirementKey({
    templateStableKey: template.stableKey,
    scheduleKind: window.scheduleKind,
    cycleStableKey: window.cycleStableKey,
    windowStartLocal: window.windowStartLocal,
    windowEndLocal: window.windowEndLocal,
    unitId: scope.unitId,
    spaceId: scope.spaceId,
    assetId: scope.assetId,
    operationalDateKey,
  });

  const fields: TemplateFieldSnapshot[] = template.fields;
  const base = {
    requirementKey,
    operationalDateKey,
    templateId: template.id,
    templateStableKey: template.stableKey,
    templateVersion: template.version,
    templateName: template.name,
    purposeType: template.purposeType,
    scheduleKind: window.scheduleKind,
    cycleStableKey: window.cycleStableKey,
    cycleLabel: window.cycleLabel,
    windowStartLocal: window.windowStartLocal,
    windowEndLocal: window.windowEndLocal,
    windowStartsAt: window.windowStartsAt,
    windowEndsAt: window.windowEndsAt,
    unitId: scope.unitId,
    spaceId: scope.spaceId,
    assetId: scope.assetId,
    assetType: scope.assetType,
    spaceType: scope.spaceType,
    fields,
    instructions: template.instructions,
  };

  if (!window.configured) {
    return {
      ...base,
      state: "NOT_CONFIGURED",
      stateLabel: stateLabel("NOT_CONFIGURED"),
      recordId: null,
      recordStatus: null,
    };
  }

  const record = input.recordsByKey.get(requirementKey) ?? null;
  if (record) {
    const state = recordState(record.status);
    return {
      ...base,
      state,
      stateLabel: stateLabel(state),
      recordId: record.id,
      recordStatus: record.status,
    };
  }

  if (input.conflicts.has(requirementKey)) {
    return {
      ...base,
      state: "CONFLICT_REVIEW",
      stateLabel: stateLabel("CONFLICT_REVIEW"),
      recordId: null,
      recordStatus: null,
    };
  }
  if (input.synchronizing.has(requirementKey)) {
    return {
      ...base,
      state: "SYNCHRONIZING",
      stateLabel: stateLabel("SYNCHRONIZING"),
      recordId: null,
      recordStatus: null,
    };
  }
  if (input.pending.has(requirementKey)) {
    return {
      ...base,
      state: "SAVED_ON_THIS_TABLET",
      stateLabel: stateLabel("SAVED_ON_THIS_TABLET"),
      recordId: null,
      recordStatus: null,
    };
  }

  const temporal = deriveTemporalState({
    now: input.now,
    windowStartsAt: window.windowStartsAt,
    windowEndsAt: window.windowEndsAt,
    scheduleKind: window.scheduleKind,
  });

  return {
    ...base,
    state: temporal,
    stateLabel: stateLabel(temporal),
    recordId: null,
    recordStatus: null,
  };
}

/**
 * Derive EvidenceRequirement[] for one facility+department+operational date.
 * Callers pass published templates/cycles/records only — drafts never appear.
 */
export function resolveEvidenceRequirements(
  input: ResolveEvidenceRequirementsInput,
): EvidenceRequirement[] {
  const recordsByKey = new Map(
    input.existingRecords.map((r) => [r.requirementKey, r] as const),
  );
  const pending = new Set(input.pendingOfflineKeys ?? []);
  const synchronizing = new Set(input.synchronizingKeys ?? []);
  const conflicts = new Set(input.conflictKeys ?? []);

  const requirements: EvidenceRequirement[] = [];
  const seen = new Set<string>();

  for (const template of input.publishedTemplates) {
    if (template.status !== "PUBLISHED") continue;

    const scopes = expandApplicability(template, input);
    if (scopes.length === 0) continue;

    const windows = resolveScheduleWindows(template, input);
    for (const scope of scopes) {
      for (const window of windows) {
        const req = buildRequirement({
          template,
          scope,
          window,
          operationalDateKey: input.operationalDateKey,
          now: input.now,
          recordsByKey,
          pending,
          synchronizing,
          conflicts,
        });
        if (seen.has(req.requirementKey)) continue;
        seen.add(req.requirementKey);
        requirements.push(req);
      }
    }
  }

  requirements.sort((a, b) => {
    const byName = a.templateName.localeCompare(b.templateName);
    if (byName !== 0) return byName;
    const aStart = a.windowStartsAt?.getTime() ?? 0;
    const bStart = b.windowStartsAt?.getTime() ?? 0;
    if (aStart !== bStart) return aStart - bStart;
    return a.requirementKey.localeCompare(b.requirementKey);
  });

  return requirements;
}
