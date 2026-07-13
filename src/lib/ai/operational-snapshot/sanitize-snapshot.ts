import { createHash } from "node:crypto";

import type { OperationalSnapshot } from "./types";

const PII_KEY_PATTERN =
  /(email|phone|mobile|birthday|birthDay|ssn|password|firstName|lastName|employeeName|fullName|resident|patient|note|notes|attachment|hr)/i;

const MAX_PRIORITY_LOCATIONS = 8;
const MAX_HANDOFFS = 6;
const MAX_SIGNALS = 4;

function stripUnknownDeep(value: unknown, depth = 0): unknown {
  if (depth > 8) return undefined;
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripUnknownDeep(item, depth + 1)).filter((item) => item !== undefined);
  }
  if (typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (PII_KEY_PATTERN.test(key)) continue;
    const next = stripUnknownDeep(child, depth + 1);
    if (next !== undefined) out[key] = next;
  }
  return out;
}

/** Allowlist projection — drops PII-shaped keys and caps list sizes. */
export function sanitizeOperationalSnapshot(snapshot: OperationalSnapshot): OperationalSnapshot {
  const priorityLocations = snapshot.priorityLocations.slice(0, MAX_PRIORITY_LOCATIONS).map((loc) => ({
    unitId: loc.unitId,
    name: loc.name,
    state: loc.state,
    primaryReason: loc.primaryReason,
    signals: loc.signals.slice(0, MAX_SIGNALS),
    sourcePath: loc.sourcePath,
  }));

  const handoffs = snapshot.handoffs.slice(0, MAX_HANDOFFS).map((h) => ({
    type: h.type,
    location: h.location,
    summary: h.summary,
    sourcePath: h.sourcePath,
  }));

  const allowedSourcePaths = Array.from(
    new Set([
      ...priorityLocations.map((l) => l.sourcePath),
      ...handoffs.map((h) => h.sourcePath),
      ...snapshot.allowedSourcePaths,
    ]),
  );

  const cleaned = {
    generatedAt: snapshot.generatedAt,
    facilityLocalTime: snapshot.facilityLocalTime,
    timezone: snapshot.timezone,
    serviceDate: snapshot.serviceDate,
    activeDepartment: snapshot.activeDepartment,
    activeOperation: {
      label: snapshot.activeOperation.label,
      phase: snapshot.activeOperation.phase,
      scheduledTime: snapshot.activeOperation.scheduledTime,
      source: snapshot.activeOperation.source,
    },
    readiness: {
      ready: snapshot.readiness.ready,
      inProgress: snapshot.readiness.inProgress,
      needsAttention: snapshot.readiness.needsAttention,
    },
    priorityLocations,
    staffing: {
      gaps: snapshot.staffing.gaps,
      thinCoverage: snapshot.staffing.thinCoverage,
      openCallDowns: snapshot.staffing.openCallDowns,
    },
    issues: {
      urgent: snapshot.issues.urgent,
      high: snapshot.issues.high,
      inProgress: snapshot.issues.inProgress,
      supplyShorts: snapshot.issues.supplyShorts,
    },
    inspections: {
      overdue: snapshot.inspections.overdue,
      dueNow: snapshot.inspections.dueNow,
      openFindings: snapshot.inspections.openFindings,
    },
    handoffs,
    allowedSourcePaths,
  } satisfies OperationalSnapshot;

  return stripUnknownDeep(cleaned) as OperationalSnapshot;
}

export function enforceSnapshotSize(
  snapshot: OperationalSnapshot,
  maxChars: number,
): OperationalSnapshot {
  let json = JSON.stringify(snapshot);
  if (json.length <= maxChars) return snapshot;

  const trimmed: OperationalSnapshot = {
    ...snapshot,
    priorityLocations: snapshot.priorityLocations.slice(0, 5),
    handoffs: snapshot.handoffs.slice(0, 3),
  };
  json = JSON.stringify(trimmed);
  if (json.length <= maxChars) return trimmed;

  return {
    ...trimmed,
    priorityLocations: trimmed.priorityLocations.slice(0, 3).map((loc) => ({
      ...loc,
      signals: loc.signals.slice(0, 2),
    })),
    handoffs: [],
    allowedSourcePaths: trimmed.priorityLocations.slice(0, 3).map((l) => l.sourcePath),
  };
}

export function hashOperationalSnapshot(snapshot: OperationalSnapshot): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex").slice(0, 32);
}

export function snapshotContainsPiiMarkers(snapshot: unknown): boolean {
  const json = JSON.stringify(snapshot);
  return /(@"|email|@|\+1\d{10}|ssn)/i.test(json) && /@[a-z0-9.-]+\.[a-z]{2,}/i.test(json);
}
