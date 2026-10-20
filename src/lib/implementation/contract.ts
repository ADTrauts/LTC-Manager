import { createHash } from "node:crypto";
import { z } from "zod";
import { resolvePublishedDepartmentProductKeys } from "@/lib/department-products";
import { setupFeeCents } from "@/lib/billing/quote";

export class ImplementationError extends Error {}
export const STAGES = ["MAPPING", "IMPORT_REVIEW", "CONFIGURATION", "TRAINING", "HANDOFF"] as const;
export type Stage = typeof STAGES[number];
const text = z.string().trim().min(3).max(4000);
const scopeSchema = z.object({ departmentKeys: z.array(z.string()).min(1).max(20), deliverables: z.array(text).min(1).max(30) }).strict();
export type Scope = z.infer<typeof scopeSchema>;
export function parseScope(input: unknown): Scope {
  const parsed = scopeSchema.safeParse(input);
  if (!parsed.success) throw new ImplementationError("Choose Departments and describe the agreed deliverables.");
  return { departmentKeys: [...resolvePublishedDepartmentProductKeys(parsed.data.departmentKeys)].sort(), deliverables: parsed.data.deliverables };
}
export function digest(input: unknown) { return createHash("sha256").update(JSON.stringify(input)).digest("hex"); }
export function quoteScope(input: unknown, waiver?: { staffId: string; reason: string }) {
  const scope = parseScope(input);
  if (waiver && (waiver.reason.trim().length < 3 || waiver.reason.length > 4000)) throw new ImplementationError("An Owner waiver requires a reason for this entire order scope.");
  const listAmountCents = setupFeeCents("ASSISTED",scope.departmentKeys.length);
  const quote = { scope, listAmountCents, amountCents: waiver ? 0 : listAmountCents, currency: "usd", waiver: waiver ? { staffId: waiver.staffId, reason: waiver.reason.trim() } : null };
  return { ...quote, digest: digest(quote) };
}
export function deliveryEvidence(input: unknown) {
  const parsed = z.object({ stage: z.enum(STAGES), disposition: z.enum(["DELIVERED","DEFERRED"]), notes: text }).strict().safeParse(input);
  if (!parsed.success) throw new ImplementationError("Record the stage, delivered/deferred outcome and specific evidence or reason.");
  return parsed.data;
}
