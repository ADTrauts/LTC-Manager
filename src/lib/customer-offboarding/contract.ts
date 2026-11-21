import { z } from "zod";
import { facilityLocalDateToServiceDate, toServiceDateKey } from "@/lib/operational-time/service-date";

export const offboardingEnabled = () => process.env.CUSTOMER_OFFBOARDING_ENABLED === "true";
export const OFFBOARDING_NOTICE = "Request and review an offboarding plan. Dates are planning dates only. Billing, limited exports, access and data preservation are handled deliberately through their existing workflows. This request does not cancel service, remove access, pause operations or delete data.";
export const SHARED_TEXT_NOTICE = "All request, plan and review text is shared with the requesting Administrator. Do not include credentials, private HR, vendor data or internal staff notes.";
export const OPEN_OFFBOARDING_STATUSES = ["REQUESTED", "PLAN_READY", "ACKNOWLEDGED"];
export const statusLabel: Record<string, string> = {
  REQUESTED: "Awaiting OWNER review", PLAN_READY: "Plan awaiting Administrator acknowledgment",
  ACKNOWLEDGED: "Plan acknowledged — actions remain deliberate", WITHDRAWN: "Request withdrawn", DECLINED: "Request declined",
};
export const reviewPage = (value: unknown) => typeof value === "string" && /^\d{1,7}$/.test(value) ? Math.max(1, Number(value)) : 1;
const date = z.string().regex(/^[1-9]\d{3}-\d{2}-\d{2}$/).refine((value) => {
  try { return toServiceDateKey(facilityLocalDateToServiceDate(value)) === value; } catch { return false; }
});
const reference = z.uuid().transform((v) => v.toLowerCase());
const revision = z.number().int().min(0).max(2147483646);
const sharedText = z.string().trim().min(8).max(1500);
const topic = z.strictObject({ reviewed: z.boolean(), notes: sharedText });
export const offboardingPlanSchema = z.strictObject({ targetDate: date, billing: topic, exports: topic, access: topic, preservation: topic });
export type OffboardingPlan = z.output<typeof offboardingPlanSchema>;
export const requestOffboardingSchema = z.strictObject({ id: reference, requestedDate: date, reason: z.string().trim().min(8).max(1000) });
export const customerOffboardingCommandSchema = z.strictObject({ commandId: reference, requestId: reference, revision,
  action: z.enum(["ACKNOWLEDGE", "WITHDRAW"]) });
export const ownerOffboardingCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ commandId: reference, requestId: reference, revision, action: z.literal("PUBLISH_PLAN"), plan: offboardingPlanSchema }),
  z.strictObject({ commandId: reference, requestId: reference, revision, action: z.literal("DECLINE"), reason: sharedText }),
]);
export type OffboardingFormState = { ok: boolean; message: string } | null;
export class OffboardingDenied extends Error {}
export function requireOffboarding(value: unknown, message: string): asserts value {
  if (!value) throw new OffboardingDenied(message);
}
export const PLAN_TOPICS = [
  { key: "billing", label: "Billing follow-through" },
  { key: "exports", label: "Existing limited Record exports" },
  { key: "access", label: "Access and operational pause follow-through" },
  { key: "preservation", label: "Data preservation follow-through" },
] as const;
