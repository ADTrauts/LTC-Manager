"use server";

import { revalidatePath } from "next/cache";

import { getPartnerFacilitySession } from "@/lib/auth";
import { partnerAuthorSession, partnerMaySetUpDepartment } from "@/lib/department-authority/partner-setup";
import { resolveDepartmentAccess } from "@/lib/department-authority/resolve";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";
import { createDraft, publishWorkPlan } from "@/lib/department-work";
import { requirePartnerOperationalContext } from "@/lib/partner-operational-context";
import { prisma } from "@/lib/prisma";

export type PartnerWorkResult = { ok: boolean; message: string } | null;

async function setupContext() {
  if (!isContractedDepartmentAuthorityEnabled()) {
    return { ok: false as const, message: "Department setup is not available." };
  }
  const session = await getPartnerFacilitySession();
  if (!session) return { ok: false as const, message: "Sign in to the vendor account first." };
  const context = await requirePartnerOperationalContext();
  const access = await resolveDepartmentAccess(prisma, session, {
    facilityId: session.facilityId,
    departmentId: context.activeDepartmentId,
  });
  if (
    !access ||
    !partnerMaySetUpDepartment({
      mode: access.mode,
      isHead: access.isHead,
      effectiveRole: context.effectiveRole,
    })
  ) {
    return { ok: false as const, message: "Only the Department head or a Partner Manager can write work plans." };
  }
  return {
    ok: true as const,
    session,
    facilityId: session.facilityId,
    departmentId: context.activeDepartmentId,
  };
}

function revalidate() {
  revalidatePath("/partner/work");
}

export async function addPartnerWorkPlanAction(
  _previous: PartnerWorkResult,
  _formData: FormData,
): Promise<PartnerWorkResult> {
  return { ok: false, message: "Generic Work is retired. Use Records for documentation." };
}

export async function publishPartnerWorkPlanAction(
  _previous: PartnerWorkResult,
  _formData: FormData,
): Promise<PartnerWorkResult> {
  return { ok: false, message: "Generic Work is retired. Use Records for documentation." };
}
