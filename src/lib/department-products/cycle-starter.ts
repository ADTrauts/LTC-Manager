/**
 * Resolve a Department Product's operating-rhythm starter.
 * UI should call this instead of branching on department.key.
 */

import {
  buildDietaryStarterPreview,
  dietaryStarterWouldCreateCount,
  type DietaryStarterPreviewNode,
} from "@/lib/operational-cycles/dietary-starter";
import {
  buildEvsStarterPreview,
  evsStarterWouldCreateCount,
  type EvsStarterPreviewNode,
} from "@/lib/operational-cycles/evs-starter";

import { getDepartmentProduct } from "./registry";

export type CycleStarterKind = "dietary" | "evs";

export type CycleStarterPreviewNode = DietaryStarterPreviewNode | EvsStarterPreviewNode;

export type ResolvedCycleStarter = {
  kind: CycleStarterKind;
  productName: string;
  actionLabel: string;
  explanation: string;
  preview: CycleStarterPreviewNode[];
};

export function resolveCycleStarterForDepartmentProduct(
  departmentKey: string | null | undefined,
): ResolvedCycleStarter | null {
  const product = getDepartmentProduct(departmentKey);
  if (!product?.starters.cycleStarter) return null;

  if (product.starters.cycleStarter === "dietary") {
    return {
      kind: "dietary",
      productName: product.name,
      actionLabel: "Use Dietary operating rhythm",
      explanation:
        "Vssyl will add editable Breakfast, Lunch, and Dinner periods. They will not be used in Run until you make them live.",
      preview: buildDietaryStarterPreview(),
    };
  }

  if (product.starters.cycleStarter === "evs") {
    return {
      kind: "evs",
      productName: product.name,
      actionLabel: "Use EVS operating rhythm",
      explanation:
        "Vssyl will add editable Morning, Afternoon, and Evening periods. They will not be used in Run until you make them live.",
      preview: buildEvsStarterPreview(),
    };
  }

  return null;
}

export function cycleStarterWouldCreateCount(
  kind: CycleStarterKind,
  existingStableKeys: ReadonlySet<string>,
): number {
  if (kind === "dietary") return dietaryStarterWouldCreateCount(existingStableKeys);
  return evsStarterWouldCreateCount(existingStableKeys);
}
