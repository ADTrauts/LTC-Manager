/**
 * Range timing audit.
 * Each service date uses one source: canonical Key Point actuals, or legacy milestones.
 */

export type TimingAuditSource = "CANONICAL_KEY_POINT_ACTUAL" | "LEGACY_MILESTONE";

export type TimingAuditDayInput = {
  serviceDateKey: string;
  model: "CANONICAL_KEY_POINTS" | "LEGACY_MILESTONES" | "NOT_CONFIGURED";
  keyPointStableKey: string;
  keyPointLabel: string;
  cycleVersion: number | null;
  plannedLocal: string | null;
  adjustedLocal: string | null;
  locationId: string | null;
  locationLabel: string | null;
  canonicalActual: { actualLocal: string; recordedAt: string; cycleVersion: number } | null;
  legacyActual: { occurredAt: string; recordedAt: string | null } | null;
};

export type TimingAuditRow = {
  serviceDate: string;
  locationId: string | null;
  locationLabel: string | null;
  keyPointStableKey: string;
  keyPointLabel: string;
  cycleVersion: number | null;
  plannedLocal: string | null;
  adjustedLocal: string | null;
  actual: string | null;
  recordedAt: string | null;
  source: TimingAuditSource;
};

export function composeOperationalTimingAudit(
  days: readonly TimingAuditDayInput[],
): TimingAuditRow[] {
  const rows: TimingAuditRow[] = [];
  for (const day of days) {
    if (day.model === "NOT_CONFIGURED") continue;
    if (day.model === "CANONICAL_KEY_POINTS") {
      rows.push({
        serviceDate: day.serviceDateKey,
        locationId: day.locationId,
        locationLabel: day.locationLabel,
        keyPointStableKey: day.keyPointStableKey,
        keyPointLabel: day.keyPointLabel,
        cycleVersion: day.canonicalActual?.cycleVersion ?? day.cycleVersion,
        plannedLocal: day.plannedLocal,
        adjustedLocal: day.adjustedLocal,
        actual: day.canonicalActual?.actualLocal ?? null,
        recordedAt: day.canonicalActual?.recordedAt ?? null,
        source: "CANONICAL_KEY_POINT_ACTUAL",
      });
      continue;
    }
    rows.push({
      serviceDate: day.serviceDateKey,
      locationId: day.locationId,
      locationLabel: day.locationLabel,
      keyPointStableKey: day.keyPointStableKey,
      keyPointLabel: day.keyPointLabel,
      cycleVersion: day.cycleVersion,
      plannedLocal: day.plannedLocal,
      adjustedLocal: day.adjustedLocal,
      actual: day.legacyActual?.occurredAt ?? null,
      recordedAt: day.legacyActual?.recordedAt ?? null,
      source: "LEGACY_MILESTONE",
    });
  }
  return rows;
}
