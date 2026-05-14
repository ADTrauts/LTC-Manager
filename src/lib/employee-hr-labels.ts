import { ChrcStatus, JobClassification, WorkStation } from "@prisma/client";

export const JOB_CLASSIFICATION_LABEL: Record<JobClassification, string> = {
  COOK: "Cook",
  FOOD_SERVICE_WORKER: "Food Service Worker",
  DIET_CLERK: "Diet Clerk",
  DIETITIAN: "Dietitian",
  OTHER: "Other",
};

export const WORK_STATION_LABEL: Record<WorkStation, string> = {
  COOK: "Cook",
  SERVER: "Server",
  DISHWASHER: "Dishwasher",
  RETAIL: "Retail",
  DIET: "Diet",
  OFFICE: "Office",
  PORTER: "Porter",
  UTILITY: "Utility",
};

export const CHRC_STATUS_LABEL: Record<ChrcStatus, string> = {
  NOT_STARTED: "Not started",
  PENDING: "Pending",
  CLEARED: "Cleared",
  NOT_APPLICABLE: "N/A",
};

/** Uniform ordering for shirt order forms (XS through 5XL). */
export const SHIRT_SIZE_OPTIONS = [
  { value: "XS", label: "XS — Extra small" },
  { value: "S", label: "S — Small" },
  { value: "M", label: "M — Medium" },
  { value: "L", label: "L — Large" },
  { value: "XL", label: "XL — Extra large" },
  { value: "2XL", label: "2XL" },
  { value: "3XL", label: "3XL" },
  { value: "4XL", label: "4XL" },
  { value: "5XL", label: "5XL" },
] as const;

export const SHIRT_SIZE_VALUES = new Set<string>(SHIRT_SIZE_OPTIONS.map((o) => o.value));

export function formatSeniorityFromHireDate(hireDate: Date): string {
  const start = new Date(hireDate);
  start.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  let months =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) months = 0;
  const years = Math.floor(months / 12);
  const mo = months % 12;
  if (years >= 1) {
    return years === 1 ? `1 yr${mo > 0 ? ` ${mo} mo` : ""}` : `${years} yrs${mo > 0 ? ` ${mo} mo` : ""}`;
  }
  return `${mo} mo`;
}
