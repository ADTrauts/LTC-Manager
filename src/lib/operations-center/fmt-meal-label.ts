import type { MealType } from "@prisma/client";

export function fmtMealLabel(meal: MealType): string {
  return meal.charAt(0) + meal.slice(1).toLowerCase();
}
