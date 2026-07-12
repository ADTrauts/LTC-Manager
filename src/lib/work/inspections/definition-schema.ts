import { InspectionResponseType } from "@prisma/client";
import { z } from "zod";

const responseTypes = [
  InspectionResponseType.PASS_FAIL,
  InspectionResponseType.YES_NO,
  InspectionResponseType.TEXT,
  InspectionResponseType.NUMBER,
  InspectionResponseType.TEMPERATURE,
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

export const upsertInspectionDefinitionSchema = z.object({
  definitionId: z.string().cuid().optional(),
  name: z.string().trim().min(3).max(140),
  description: z.string().trim().max(1000).optional().nullable(),
  frequency: z.string().trim().max(120).optional().nullable(),
  departmentId: z.string().cuid().optional().nullable(),
  unitId: z.string().cuid().optional().nullable(),
  isActive: z.coerce.boolean().default(true),
  items: z.array(inspectionDefinitionItemSchema).min(1).max(40),
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
