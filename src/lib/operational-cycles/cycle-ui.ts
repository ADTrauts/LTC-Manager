/**
 * Progressive disclosure rules for Operational Cycles lifecycle sections.
 * True first-setup hides Current/Draft/Scheduled/History until data exists.
 */

export type CycleLifecyclePresence = {
  currentCount: number;
  draftCount: number;
  scheduledCount: number;
  historyCount: number;
};

export function isTrueCycleFirstSetup(presence: CycleLifecyclePresence): boolean {
  return (
    presence.currentCount === 0 &&
    presence.draftCount === 0 &&
    presence.scheduledCount === 0 &&
    presence.historyCount === 0
  );
}

export function shouldShowCycleCurrentSection(presence: CycleLifecyclePresence): boolean {
  return presence.currentCount > 0;
}

export function shouldShowCycleDraftSection(presence: CycleLifecyclePresence): boolean {
  return presence.draftCount > 0;
}

export function shouldShowCycleScheduledSection(presence: CycleLifecyclePresence): boolean {
  return presence.scheduledCount > 0;
}

export function shouldShowCycleHistorySection(presence: CycleLifecyclePresence): boolean {
  return presence.historyCount > 0;
}

/** Compact Overview summary for Operational Cycles lifecycle. */
export function formatCycleOverviewSummary(input: {
  currentCount: number;
  draftCount: number;
  scheduledCount: number;
  scheduledEffectiveFrom?: string | null;
}): string {
  if (
    input.currentCount === 0 &&
    input.draftCount === 0 &&
    input.scheduledCount === 0
  ) {
    return "0 configured";
  }
  const parts: string[] = [];
  if (input.currentCount > 0) {
    parts.push(`${input.currentCount} configured`);
  }
  if (input.draftCount > 0) {
    parts.push("draft changes");
  }
  if (input.scheduledCount > 0) {
    parts.push(
      input.scheduledEffectiveFrom
        ? `changes scheduled ${input.scheduledEffectiveFrom}`
        : "changes scheduled",
    );
  }
  if (parts.length === 0 && input.draftCount === 0) {
    return "0 configured";
  }
  if (parts.length === 0) {
    return "draft changes";
  }
  return parts.join(" · ");
}
