/**
 * Product-owned Location Function identities.
 *
 * The Department Product authors functionKey. A facility adopts that key and
 * binds it to rooms. Display labels and room names are not the identity.
 */

import type { DepartmentProductKey } from "./registry";

export type LocationFunctionDefinition = {
  functionKey: string;
  label: string;
  productKey: DepartmentProductKey;
  description: string;
};

/**
 * Minimum functions required by current starter Work.
 * Dietary presets share one service-area function.
 * EVS room-clean and common-area presets each need one function.
 * Plant has no cycle or work starter that targets a function.
 */
export const LOCATION_FUNCTIONS: readonly LocationFunctionDefinition[] = [
  {
    functionKey: "food_service_area",
    label: "Food Service Area",
    productKey: "DIETARY",
    description:
      "Where Dietary serves food. Serveries, pods, and kitchenettes use this key when the facility binds them.",
  },
  {
    functionKey: "resident_care",
    label: "Resident Care Area",
    productKey: "EVS",
    description: "Resident rooms on the EVS morning cleaning cycle.",
  },
  {
    functionKey: "service_support",
    label: "Service / Support Area",
    productKey: "EVS",
    description: "Public areas and restrooms on the EVS daytime cleaning cycle.",
  },
];

const BY_PRODUCT_AND_KEY = new Map<string, LocationFunctionDefinition>(
  LOCATION_FUNCTIONS.map((fn) => [`${fn.productKey}:${fn.functionKey}`, fn]),
);

export function listLocationFunctionsForProduct(
  productKey: string | null | undefined,
): readonly LocationFunctionDefinition[] {
  if (!productKey) return [];
  return LOCATION_FUNCTIONS.filter((fn) => fn.productKey === productKey);
}

export function getLocationFunction(
  productKey: string | null | undefined,
  functionKey: string | null | undefined,
): LocationFunctionDefinition | null {
  if (!productKey || !functionKey) return null;
  return BY_PRODUCT_AND_KEY.get(`${productKey}:${functionKey.trim()}`) ?? null;
}

export function getLocationFunctionByKey(
  functionKey: string | null | undefined,
): LocationFunctionDefinition | null {
  const key = functionKey?.trim();
  if (!key) return null;
  return LOCATION_FUNCTIONS.find((fn) => fn.functionKey === key) ?? null;
}

/**
 * Facility adoption record. The persisted key is the Product functionKey.
 * A local display name is ignored and cannot mint or rename the key.
 */
export function resolveLocationFunctionAdoption(input: {
  productKey: string | null | undefined;
  functionKey: string | null | undefined;
  displayName?: string | null;
}): { key: string; name: string; description: string } | null {
  const fn = getLocationFunction(input.productKey, input.functionKey);
  if (!fn) return null;
  return {
    key: fn.functionKey,
    name: fn.label,
    description: fn.description,
  };
}
