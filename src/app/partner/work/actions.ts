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
  formData: FormData,
): Promise<PartnerWorkResult> {
  const gate = await setupContext();
  if (!gate.ok) return gate;
  const catalogStableKey = String(formData.get("catalogStableKey") ?? "").trim();
  if (catalogStableKey) {
    const form = await prisma.catalogLogDefinition.findFirst({
      where: {
        stableKey: catalogStableKey,
        ownerKind: "ORGANIZATION",
        ownerOrganizationId: gate.session.partnerOrganizationId,
        status: "PUBLISHED",
      },
      select: { id: true },
    });
    if (!form) return { ok: false, message: "Choose one of your organization's published forms." };
  }
  try {
    const created = await createDraft(partnerAuthorSession(gate.session), {
      facilityId: gate.facilityId,
      departmentId: gate.departmentId,
      actor: { userId: gate.session.uid, label: gate.session.name },
      draft: {
        name: String(formData.get("name") ?? ""),
        effectiveStartDate: String(formData.get("effectiveStartDate") ?? "") || null,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        items: [
          {
            label: String(formData.get("stepLabel") ?? ""),
            displaySequence: 0,
            scheduleKind: "ONCE_PER_OPERATIONAL_DATE",
            completionMode: catalogStableKey ? "LINKED_EVIDENCE" : "EXPLICIT_CONFIRMATION",
            linkedTemplateStableKey: catalogStableKey || null,
          },
        ],
      },
    });
    revalidate();
    return { ok: true, message: `Draft “${created.name}” saved.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not save the work plan." };
  }
}

export async function publishPartnerWorkPlanAction(
  _previous: PartnerWorkResult,
  formData: FormData,
): Promise<PartnerWorkResult> {
  const gate = await setupContext();
  if (!gate.ok) return gate;
  const workPlanId = String(formData.get("workPlanId") ?? "");
  const row = await prisma.departmentWorkPlan.findFirst({
    where: {
      id: workPlanId,
      facilityId: gate.facilityId,
      departmentId: gate.departmentId,
      status: "DRAFT",
    },
    select: { id: true },
  });
  if (!row) return { ok: false, message: "Choose a draft in this Department." };
  try {
    await publishWorkPlan(partnerAuthorSession(gate.session), {
      facilityId: gate.facilityId,
      departmentId: gate.departmentId,
      workPlanId: row.id,
      actor: { userId: gate.session.uid, label: gate.session.name },
    });
    revalidate();
    return { ok: true, message: "Work plan published." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not publish the work plan." };
  }
}
