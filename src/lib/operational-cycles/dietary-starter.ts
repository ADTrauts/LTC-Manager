/**
 * Dietary starter template helpers (onboarding only).
 * Nested Breakfast/Lunch/Dinner structure — not a permanent sync source.
 */

import { buildDietaryDefaultCyclePlans, type DietaryDefaultCyclePlan } from "./defaults";
import { projectCycleHierarchy } from "./cycle-hierarchy";

export type DietaryStarterPreviewNode = {
  stableKey: string;
  label: string;
  children: Array<{ stableKey: string; label: string }>;
};

/** Nested preview for the starter UI (roots → phases). */
export function buildDietaryStarterPreview(): DietaryStarterPreviewNode[] {
  const plans = buildDietaryDefaultCyclePlans();
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

/** Starter plans not yet present by stableKey (labels are ignored — rename-safe). */
export function dietaryStarterPlansToCreate(
  existingStableKeys: ReadonlySet<string>,
): DietaryDefaultCyclePlan[] {
  const plans = buildDietaryDefaultCyclePlans().filter(
    (plan) => !existingStableKeys.has(plan.stableKey),
  );
  const creating = new Set(plans.map((p) => p.stableKey));
  return plans.filter((plan) => {
    if (!plan.parentStableKey) return true;
    return (
      existingStableKeys.has(plan.parentStableKey) || creating.has(plan.parentStableKey)
    );
  });
}

export function dietaryStarterWouldCreateCount(
  existingStableKeys: ReadonlySet<string>,
): number {
  return dietaryStarterPlansToCreate(existingStableKeys).length;
}

/**
 * True when the department already has draft/published/scheduled cycle config.
 * Starter onboarding should not stay permanently expanded in this state.
 */
export function departmentHasCycleConfiguration(input: {
  currentCount: number;
  draftCount: number;
  scheduledCount: number;
}): boolean {
  return input.currentCount + input.draftCount + input.scheduledCount > 0;
}
