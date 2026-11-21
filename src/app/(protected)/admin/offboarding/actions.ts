"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createOffboardingRequest, customerOffboardingCommand } from "@/lib/customer-offboarding/service";
import { OffboardingDenied, type OffboardingFormState } from "@/lib/customer-offboarding/contract";

function refresh(id: string) {
  for (const path of ["/admin/offboarding", `/admin/offboarding/${id}`, "/console/offboarding", `/console/offboarding/${id}`]) revalidatePath(path);
}

export async function requestCustomerOffboardingAction(_previous: OffboardingFormState, form: FormData): Promise<OffboardingFormState> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Sign in as the current Facility Administrator." };
  if (form.get("reviewed") !== "yes") return { ok: false, message: "Confirm that this requests a review, without automatically closing service." };
  let id: string;
  try {
    id = await createOffboardingRequest(prisma, session, { id: form.get("id"), requestedDate: form.get("requestedDate"), reason: form.get("reason") });
  } catch (error) {
    if (error instanceof OffboardingDenied) return { ok: false, message: error.message };
    return { ok: false, message: "The request could not be saved. Retry using this request reference, or reload to review current status." };
  }
  refresh(id);
  redirect(`/admin/offboarding/${id}`);
}

export async function respondCustomerOffboardingAction(_previous: OffboardingFormState, form: FormData): Promise<OffboardingFormState> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Sign in as the current Facility Administrator." };
  if (form.get("reviewed") !== "yes") return { ok: false, message: "Review the current plan and confirm your choice." };
  try {
    const id = await customerOffboardingCommand(prisma, session, { commandId: form.get("commandId"), requestId: form.get("requestId"),
      revision: Number(form.get("revision")), action: form.get("decision") });
    refresh(id);
    return { ok: true, message: form.get("decision") === "ACKNOWLEDGE" ? "This plan version is acknowledged. Service actions remain deliberate." :
      "Request withdrawn. Existing billing, access and any operational pause are unchanged." };
  } catch (error) {
    return { ok: false, message: error instanceof OffboardingDenied ? error.message : "The decision could not be saved. Retry with the same reference or reload to review current status." };
  }
}
