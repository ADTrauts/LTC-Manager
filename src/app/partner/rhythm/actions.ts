"use server";

import { revalidatePath } from "next/cache";

import type { PartnerFacilitySession } from "@/lib/auth";
import { getPartnerFacilitySession } from "@/lib/auth";
import { partnerAuthorSession, partnerMaySetUpDepartment } from "@/lib/department-authority/partner-setup";
import { resolveDepartmentAccess } from "@/lib/department-authority/resolve";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";
import { createDraft, publishCycle } from "@/lib/operational-cycles";
import { requirePartnerOperationalContext } from "@/lib/partner-operational-context";
import { toServiceDateKey } from "@/lib/operational-time/service-date";
import { prisma } from "@/lib/prisma";

export type PartnerRhythmResult = { ok: boolean; message: string } | null;

async function setupContext(): Promise<
  | { ok: false; message: string }
  | {
      ok: true;
      session: PartnerFacilitySession;
      facilityId: string;
      departmentId: string;
    }
> {
  if (!isContractedDepartmentAuthorityEnabled()) {
    return { ok: false, message: "Department setup is not available." };
  }
  const session = await getPartnerFacilitySession();
  if (!session) return { ok: false, message: "Sign in to the vendor account first." };
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
    return { ok: false, message: "Only the Department head or a Partner Manager can set the operating rhythm." };
  }
  return {
    ok: true,
    session,
    facilityId: session.facilityId,
    departmentId: context.activeDepartmentId,
  };
}

function revalidate() {
  revalidatePath("/partner/rhythm");
}

export async function addPartnerCycleAction(
  _previous: PartnerRhythmResult,
  formData: FormData,
): Promise<PartnerRhythmResult> {
  const gate = await setupContext();
  if (!gate.ok) return gate;
  try {
      const created = await createDraft(partnerAuthorSession(gate.session), {
      facilityId: gate.facilityId,
      departmentId: gate.departmentId,
      actor: { userId: gate.session.uid, label: gate.session.name },
      draft: {
        label: String(formData.get("label") ?? ""),
        cycleType: "SERVICE",
        nodeKind: "PERIOD",
        startLocal: String(formData.get("startLocal") ?? ""),
        endLocal: String(formData.get("endLocal") ?? ""),
        applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        effectiveFrom: String(formData.get("effectiveFrom") ?? ""),
        locationMode: "ALL_DEPARTMENT_UNITS",
      },
    });
    revalidate();
    return { ok: true, message: `Draft “${created.label}” created for the whole Department.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not create the cycle." };
  }
}

export async function addPartnerPhaseAction(
  _previous: PartnerRhythmResult,
  formData: FormData,
): Promise<PartnerRhythmResult> {
  const gate = await setupContext();
  if (!gate.ok) return gate;
  const parentStableKey = String(formData.get("parentStableKey") ?? "");
  const parent = await prisma.departmentOperationalCycle.findFirst({
    where: {
      facilityId: gate.facilityId,
      departmentId: gate.departmentId,
      stableKey: parentStableKey,
      parentStableKey: null,
      nodeKind: "PERIOD",
      status: "DRAFT",
    },
    select: { id: true },
  });
  if (!parent) return { ok: false, message: "Choose a draft cycle." };
  try {
      const created = await createDraft(partnerAuthorSession(gate.session), {
      facilityId: gate.facilityId,
      departmentId: gate.departmentId,
      actor: { userId: gate.session.uid, label: gate.session.name },
      draft: {
        label: String(formData.get("label") ?? ""),
        cycleType: "SERVICE",
        nodeKind: "PERIOD",
        parentStableKey,
        locationInheritFromParent: true,
        startLocal: String(formData.get("startLocal") ?? ""),
        endLocal: String(formData.get("endLocal") ?? ""),
        applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        effectiveFrom: String(formData.get("effectiveFrom") ?? ""),
      },
    });
    revalidate();
    return { ok: true, message: `Phase “${created.label}” added.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not add the phase." };
  }
}

export async function addPartnerKeyPointAction(
  _previous: PartnerRhythmResult,
  formData: FormData,
): Promise<PartnerRhythmResult> {
  const gate = await setupContext();
  if (!gate.ok) return gate;
  const parentStableKey = String(formData.get("parentStableKey") ?? "");
  const parent = await prisma.departmentOperationalCycle.findFirst({
    where: {
      facilityId: gate.facilityId,
      departmentId: gate.departmentId,
      stableKey: parentStableKey,
      parentStableKey: null,
      nodeKind: "PERIOD",
      status: "DRAFT",
    },
    select: { id: true, effectiveFrom: true },
  });
  if (!parent) return { ok: false, message: "Choose a draft cycle." };
  const dueLocal = String(formData.get("dueLocal") ?? "");
  try {
      const created = await createDraft(partnerAuthorSession(gate.session), {
      facilityId: gate.facilityId,
      departmentId: gate.departmentId,
      actor: { userId: gate.session.uid, label: gate.session.name },
      draft: {
        label: String(formData.get("label") ?? ""),
        cycleType: "SERVICE",
        nodeKind: "KEY_TIME",
        parentStableKey,
        keyPointGrain: "DEPARTMENT",
        keyTimeGroups: [{ dueLocal, spaceIds: [] }],
        applicableDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        effectiveFrom: toServiceDateKey(parent.effectiveFrom),
      },
    });
    revalidate();
    return { ok: true, message: `Key point “${created.label}” added.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not add the key point." };
  }
}

export async function publishPartnerCycleAction(
  _previous: PartnerRhythmResult,
  formData: FormData,
): Promise<PartnerRhythmResult> {
  const gate = await setupContext();
  if (!gate.ok) return gate;
  const cycleId = String(formData.get("cycleId") ?? "");
  const row = await prisma.departmentOperationalCycle.findFirst({
    where: {
      id: cycleId,
      facilityId: gate.facilityId,
      departmentId: gate.departmentId,
      status: "DRAFT",
    },
    select: { id: true },
  });
  if (!row) return { ok: false, message: "Choose a draft in this Department." };
  try {
    await publishCycle(partnerAuthorSession(gate.session), {
      facilityId: gate.facilityId,
      departmentId: gate.departmentId,
      cycleId: row.id,
      actor: { userId: gate.session.uid, label: gate.session.name },
    });
    revalidate();
    return { ok: true, message: "Published." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not publish." };
  }
}
