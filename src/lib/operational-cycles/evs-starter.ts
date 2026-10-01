/**
 * EVS starter template helpers (configuration-time only).
 * Morning / Afternoon / Evening Operations — not a permanent sync source.
 */

import { buildEvsDefaultCyclePlans, type EvsDefaultCyclePlan } from "./defaults";
import { projectCycleHierarchy } from "./cycle-hierarchy";

export type EvsStarterPreviewNode = {
  stableKey: string;
  label: string;
  children: Array<{ stableKey: string; label: string }>;
};

export function buildEvsStarterPreview(): EvsStarterPreviewNode[] {
  const plans = buildEvsDefaultCyclePlans();
  const tree = projectCycleHierarchy(
    plans.map((plan) => ({
      stableKey: plan.stableKey,
      label: plan.label,
      parentStableKey: plan.parentStableKey,
      displaySequence: plan.displaySequence,
    })),
  );
  return tree.roots.map((root) => ({
    stableKey: root.stableKey,
    label: root.label,
    children: root.children.map((child) => ({
      stableKey: child.stableKey,
      label: child.label,
    })),
  }));
}

/** Starter plans not yet present by stableKey (labels ignored — rename-safe). */
export function evsStarterPlansToCreate(
  existingStableKeys: ReadonlySet<string>,
): EvsDefaultCyclePlan[] {
  return buildEvsDefaultCyclePlans().filter((plan) => !existingStableKeys.has(plan.stableKey));
}

export function evsStarterWouldCreateCount(existingStableKeys: ReadonlySet<string>): number {
  return evsStarterPlansToCreate(existingStableKeys).length;
}
