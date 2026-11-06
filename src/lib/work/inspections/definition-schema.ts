import { InspectionCadenceType, InspectionResponseType } from "@prisma/client";
import { z } from "zod";

const responseTypes = [
  InspectionResponseType.PASS_FAIL,
  InspectionResponseType.YES_NO,
  InspectionResponseType.TEXT,
  InspectionResponseType.NUMBER,
  InspectionResponseType.TEMPERATURE,
] as const;

const cadenceTypes = [
  InspectionCadenceType.ON_DEMAND,
  InspectionCadenceType.DAILY,
  InspectionCadenceType.WEEKLY,
  InspectionCadenceType.MONTHLY,
] as const;

export const inspectionDefinitionItemSchema = z.object({
  id: z.string().cuid().optional(),
  label: z.string().trim().min(2).max(200),
  description: z.string().trim().max(500).optional().nullable(),
  sortOrder: z.coerce.number().int().min(1).max(999),
  isRequired: z.coerce.boolean(),
  responseType: z.enum(responseTypes),
  failureCreatesFollowUp: z.coerce.boolean(),
});

export const upsertInspectionDefinitionSchema = z
  .object({
    definitionId: z.string().cuid().optional(),
    name: z.string().trim().min(3).max(140),
    description: z.string().trim().max(1000).optional().nullable(),
    frequency: z.string().trim().max(120).optional().nullable(),
    cadenceType: z.enum(cadenceTypes).default(InspectionCadenceType.ON_DEMAND),
    dueTimeLocal: z
      .string()
      .trim()
      .regex(/^\d{1,2}:\d{2}$/, "Use HH:MM")
      .optional()
      .nullable(),
    daysOfWeek: z.array(z.coerce.number().int().min(0).max(6)).max(7).default([]),
    dayOfMonth: z.coerce.number().int().min(1).max(31).optional().nullable(),
    departmentId: z.string().cuid().optional().nullable(),
    unitId: z.string().cuid().optional().nullable(),
    isActive: z.coerce.boolean().default(true),
    items: z.array(inspectionDefinitionItemSchema).min(1).max(40),
  })
  .superRefine((value, ctx) => {
    if (value.cadenceType === "WEEKLY" && value.daysOfWeek.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Select at least one weekday for weekly inspections.",
        path: ["daysOfWeek"],
      });
    }
    if (value.cadenceType === "MONTHLY" && (value.dayOfMonth == null || value.dayOfMonth < 1)) {
      ctx.addIssue({
        code: "custom",
        message: "Choose a day of month for monthly inspections.",
        path: ["dayOfMonth"],
      });
    }
  });

export type UpsertInspectionDefinitionInput = z.infer<typeof upsertInspectionDefinitionSchema>;

export function parseInspectionItemsJson(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error("Inspection items are required.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Inspection items payload is invalid.");
  }
  return z.array(inspectionDefinitionItemSchema).min(1).max(40).parse(parsed);
}

export function parseDaysOfWeekJson(raw: FormDataEntryValue | null): number[] {
  if (typeof raw !== "string" || raw.trim().length === 0) return [];
  try {
    const parsed = JSON.parse(raw);
    return z.array(z.coerce.number().int().min(0).max(6)).max(7).parse(parsed);
  } catch {
    return [];
  }
}
