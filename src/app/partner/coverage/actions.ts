"use server";

import { revalidatePath } from "next/cache";

import { getPartnerFacilitySession } from "@/lib/auth";
import { partnerMaySetUpDepartment } from "@/lib/department-authority/partner-setup";
import { resolveDepartmentAccess } from "@/lib/department-authority/resolve";
import { listVendorDepartmentPeople } from "@/lib/department-authority/vendor-workforce";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";
import { requirePartnerOperationalContext } from "@/lib/partner-operational-context";
import { prisma } from "@/lib/prisma";
import { createCanonicalShift } from "@/lib/scheduling/canonical-shift-service";
import { markShiftsCalledOff, moveDayAssignment, peopleChangeIsMove } from "@/lib/scheduling/people-coverage";

export type PartnerCoverageResult = { ok: boolean; message: string } | null;

async function setupContext(): Promise<
  | { ok: false; message: string }
  | { ok: true; facilityId: string; departmentId: string; actorUserId: string }
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
    return { ok: false, message: "Only the Department head or a Partner Manager can change coverage." };
  }
  return {
    ok: true,
    facilityId: session.facilityId,
    departmentId: context.activeDepartmentId,
    actorUserId: session.uid,
  };
}

async function personInDepartment(facilityId: string, departmentId: string, employeeId: string) {
  const people = await listVendorDepartmentPeople(prisma, { facilityId, departmentId });
  return people.some((person) => person.id === employeeId);
}

function revalidate() {
  revalidatePath("/partner/coverage");
  revalidatePath("/partner/people");
}

export async function addPartnerShiftAction(
  _previous: PartnerCoverageResult,
  formData: FormData,
): Promise<PartnerCoverageResult> {
  const gate = await setupContext();
  if (!gate.ok) return gate;
  const employeeId = String(formData.get("employeeId") ?? "");
  if (!(await personInDepartment(gate.facilityId, gate.departmentId, employeeId))) {
    return { ok: false, message: "That person is not in this Department." };
  }
  try {
    await createCanonicalShift({
      facilityId: gate.facilityId,
      departmentId: gate.departmentId,
      employeeId,
      serviceDate: String(formData.get("serviceDate") ?? ""),
      plannedStart: String(formData.get("plannedStart") ?? ""),
      plannedEnd: String(formData.get("plannedEnd") ?? ""),
      createdByUserId: gate.actorUserId,
    });
    revalidate();
    return { ok: true, message: "Shift saved." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not save the shift." };
  }
}

export async function callOffPartnerShiftAction(
  _previous: PartnerCoverageResult,
  formData: FormData,
): Promise<PartnerCoverageResult> {
  const gate = await setupContext();
  if (!gate.ok) return gate;
  const employeeId = String(formData.get("employeeId") ?? "");
  if (!(await personInDepartment(gate.facilityId, gate.departmentId, employeeId))) {
    return { ok: false, message: "That person is not in this Department." };
  }
  const template = String(formData.get("reasonTemplate") ?? "call-off");
  if (peopleChangeIsMove(template)) {
    return { ok: false, message: "Use Move for a location change." };
  }
  try {
    await markShiftsCalledOff({
      facilityId: gate.facilityId,
      employeeId,
      serviceDate: String(formData.get("serviceDate") ?? ""),
      reason: String(formData.get("reason") ?? "Call-off").trim() || "Call-off",
    });
    revalidate();
    return { ok: true, message: "Shift marked called off." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not mark the call-off." };
  }
}

export async function movePartnerAssignmentAction(
  _previous: PartnerCoverageResult,
  formData: FormData,
): Promise<PartnerCoverageResult> {
  const gate = await setupContext();
  if (!gate.ok) return gate;
  const employeeId = String(formData.get("employeeId") ?? "");
  const unitId = String(formData.get("unitId") ?? "");
  if (!(await personInDepartment(gate.facilityId, gate.departmentId, employeeId))) {
    return { ok: false, message: "That person is not in this Department." };
  }
  const unit = await prisma.unit.findFirst({
    where: {
      id: unitId,
      facilityId: gate.facilityId,
      departmentResponsibilities: { some: { departmentId: gate.departmentId } },
    },
    select: { id: true },
  });
  if (!unit) return { ok: false, message: "Choose a room this Department is responsible for." };
  try {
    await moveDayAssignment({
      facilityId: gate.facilityId,
      employeeId,
      serviceDate: String(formData.get("serviceDate") ?? ""),
      unitId: unit.id,
      reason: String(formData.get("reason") ?? "Moved").trim() || "Moved",
      actorUserId: gate.actorUserId,
    });
    revalidate();
    return { ok: true, message: "Assignment moved." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not move the assignment." };
  }
}

export async function createPartnerTeamAction(
  _previous: PartnerCoverageResult,
  formData: FormData,
): Promise<PartnerCoverageResult> {
  const gate = await setupContext();
  if (!gate.ok) return gate;
  const displayName = String(formData.get("displayName") ?? "").trim().replace(/\s+/g, " ");
  if (displayName.length < 1 || displayName.length > 80) {
    return { ok: false, message: "Team name must be 1–80 characters." };
  }
  const existing = await prisma.departmentTeam.findFirst({
    where: {
      facilityId: gate.facilityId,
      departmentId: gate.departmentId,
      status: "ACTIVE",
      displayName: { equals: displayName, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existing) return { ok: false, message: "That team already exists." };
  await prisma.departmentTeam.create({
    data: {
      facilityId: gate.facilityId,
      departmentId: gate.departmentId,
      displayName,
    },
  });
  revalidate();
  return { ok: true, message: "Team added." };
}
