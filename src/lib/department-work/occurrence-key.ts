/**
 * Deterministic Work occurrence identity (idempotent derivation + offline sync).
 */

export type OccurrenceKeyParts = {
  sourceKind: "WORK_PLAN" | "ONE_OFF";
  workPlanStableKey?: string | null;
  workPlanVersion?: number | null;
  workItemKey?: string | null;
  operationalDate: string; // YYYY-MM-DD
  unitId: string | null;
  spaceId?: string | null;
  cycleStableKey?: string | null;
  windowStartLocal?: string | null;
  windowEndLocal?: string | null;
  /** Only for EACH_ASSIGNED_EMPLOYEE or one-off targeted Employee. */
  employeeId?: string | null;
  /** Required for ONE_OFF when no plan identity exists. */
  oneOffNonce?: string | null;
};

export function buildOccurrenceKey(parts: OccurrenceKeyParts): string {
  const date = parts.operationalDate.slice(0, 10);
  if (parts.sourceKind === "ONE_OFF") {
    const nonce = parts.oneOffNonce?.trim();
    if (!nonce) {
      throw new Error("oneOffNonce required for ONE_OFF occurrence key.");
    }
    return [
      "oneoff",
      date,
      parts.unitId ?? "",
      parts.spaceId ?? "",
      parts.employeeId ?? "",
      nonce,
    ].join("|");
  }

  return [
    "plan",
    parts.workPlanStableKey ?? "",
    String(parts.workPlanVersion ?? ""),
    parts.workItemKey ?? "",
    date,
    parts.unitId ?? "",
    parts.spaceId ?? "",
    parts.cycleStableKey ?? "",
    parts.windowStartLocal ?? "",
    parts.windowEndLocal ?? "",
    parts.employeeId ?? "",
  ].join("|");
}
