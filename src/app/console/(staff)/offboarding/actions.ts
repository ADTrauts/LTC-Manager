"use server";

import { revalidatePath } from "next/cache";
import { requireHarborOwner } from "@/lib/harbor-console/auth";
import { ownerOffboardingCommand } from "@/lib/customer-offboarding/service";
import { OffboardingDenied, PLAN_TOPICS, type OffboardingFormState } from "@/lib/customer-offboarding/contract";
import { prisma } from "@/lib/prisma";

export async function reviewCustomerOffboardingAction(_previous: OffboardingFormState, form: FormData): Promise<OffboardingFormState> {
  const session = await requireHarborOwner();
  if (form.get("reviewed") !== "yes") return { ok: false, message: "Confirm you reviewed this customer-visible plan or decline decision." };
  const input = { commandId: form.get("commandId"), requestId: form.get("requestId"), revision: Number(form.get("revision")), action: form.get("decision") };
  const topicInput = Object.fromEntries(PLAN_TOPICS.map(({ key }) => [key, { reviewed: form.get(`${key}Reviewed`) === "yes", notes: form.get(`${key}Notes`) }]));
  const raw = input.action === "PUBLISH_PLAN" ? { ...input, plan: { targetDate: form.get("targetDate"), ...topicInput } } :
    { ...input, reason: form.get("reason") };
  try {
    const id = await ownerOffboardingCommand(prisma, session, raw);
    for (const path of ["/admin/offboarding", `/admin/offboarding/${id}`, "/console/offboarding", `/console/offboarding/${id}`]) revalidatePath(path);
    return { ok: true, message: input.action === "PUBLISH_PLAN" ? "A new plan version is published for Administrator acknowledgment. No service action was executed." :
      "Request declined. No billing, access or data changes were made." };
  } catch (error) {
    return { ok: false, message: error instanceof OffboardingDenied ? error.message : "The review could not be saved. Retry with the same reference or reload to review current status." };
  }
}
