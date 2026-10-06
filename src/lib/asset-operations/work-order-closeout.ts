/**
 * Phase 3D Work Order closeout: labor, parts, recorded expense, required Records,
 * Asset condition review, and the prospective completion gate.
 *
 * Completing a Work Order still does not resolve Issue or Request.
 * Asset condition changes only when the explicit review choice says to change it.
 */
import {
  Prisma,
  type RepairStatus,
} from "@prisma/client";
import { hasAtLeastRole } from "@/lib/access";
import type { AppJwtPayload } from "@/lib/auth";
import { sessionUserIdForFk } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOperationalEmployeeIdForSession } from "@/lib/session-employee";

import { changeAssetStatus } from "./asset-service";
import { isAssignedWorkOrderTechnician } from "./work-order-actor";
import {
  appendRepairUpdate,
  loadWorkOrderScoped,
  newWorkOrderCuid,
  resolveWorkOrderActorAuthority,
  type DbClient,
  type WorkOrderActor,
} from "./work-order-access";
import {
  formatWorkOrderCloseoutBlockedMessage,
  validateWorkOrderCloseout,
  WAIVE_REASON_MIN_LENGTH,
  type RepairAssetConditionReviewChoice,
} from "./work-order-closeout-gate";
import { completePmOccurrenceForWorkOrder } from "@/lib/preventive-maintenance/complete-occurrence";

export {
  formatWorkOrderCloseoutBlockedMessage,
  SATISFYING_RECORD_STATUSES,
  validateWorkOrderCloseout,
  WAIVE_REASON_MIN_LENGTH,
  WORK_PERFORMED_MIN_LENGTH,
  type RepairAssetConditionReviewChoice,
  type WorkOrderCloseoutMissingFact,
  type WorkOrderCloseoutValidation,
} from "./work-order-closeout-gate";

const ACTIVE_CLOSEOUT_STATUSES: RepairStatus[] = [
  "OPEN",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_PARTS",
  "WAITING_ON_VENDOR",
  "ON_HOLD",
];

const COMPLETED_STATUSES: RepairStatus[] = ["COMPLETED", "CLOSED"];

export function parseNonNegativeDecimal(raw: string, scale: number): Prisma.Decimal {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Enter a valid non-negative amount.");
  }
  const value = new Prisma.Decimal(trimmed);
  if (value.lt(0)) {
    throw new Error("Negative maintenance costs are not allowed.");
  }
  return value.toDecimalPlaces(scale);
}

export function parsePositiveQuantity(raw: string): Prisma.Decimal {
  const value = parseNonNegativeDecimal(raw, 3);
  if (value.lte(0)) {
    throw new Error("Part quantity must be greater than zero.");
  }
  return value;
}

export function projectRecordedExpense(input: {
  parts: Array<{ lineCost: Prisma.Decimal | null }>;
  externalCost: Prisma.Decimal | null;
}): {
  recordedPartsCost: Prisma.Decimal | null;
  recordedExternalCost: Prisma.Decimal | null;
  recordedMaterialVendorExpense: Prisma.Decimal | null;
} {
  let recordedPartsCost: Prisma.Decimal | null = null;
  for (const part of input.parts) {
    if (part.lineCost == null) continue;
    recordedPartsCost =
      recordedPartsCost == null ? part.lineCost : recordedPartsCost.add(part.lineCost);
  }
  const recordedExternalCost = input.externalCost;
  let recordedMaterialVendorExpense: Prisma.Decimal | null = null;
  if (recordedPartsCost != null) {
    recordedMaterialVendorExpense = recordedPartsCost;
  }
  if (recordedExternalCost != null) {
    recordedMaterialVendorExpense =
      recordedMaterialVendorExpense == null
        ? recordedExternalCost
        : recordedMaterialVendorExpense.add(recordedExternalCost);
  }
  return {
    recordedPartsCost,
    recordedExternalCost,
    recordedMaterialVendorExpense,
  };
}

export function formatRecordedExpense(value: Prisma.Decimal | null | undefined): string | null {
  if (value == null) return null;
  return `$${value.toFixed(2)}`;
}

export function derivedUnitCost(
  lineCost: Prisma.Decimal | null | undefined,
  quantity: Prisma.Decimal | null | undefined,
): Prisma.Decimal | null {
  if (lineCost == null || quantity == null || quantity.lte(0)) return null;
  return lineCost.div(quantity);
}

async function loadCloseoutFacts(client: DbClient, repairId: string) {
  const [laborEntries, partsUsed, recordRequirements] = await Promise.all([
    client.repairLaborEntry.findMany({ where: { repairId } }),
    client.repairPartUsed.findMany({ where: { repairId } }),
    client.repairRecordRequirement.findMany({
      where: { repairId },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  return { laborEntries, partsUsed, recordRequirements };
}

function assertActiveWorkOrder(status: RepairStatus, action: string) {
  if (status === "CANCELLED") {
    throw new Error(`Cancelled Work Orders cannot ${action}.`);
  }
  if (!ACTIVE_CLOSEOUT_STATUSES.includes(status) && !COMPLETED_STATUSES.includes(status)) {
    throw new Error(`Work Order cannot ${action} from status ${status}.`);
  }
}

function assertSupervisorPlus(session: AppJwtPayload, message: string) {
  if (!hasAtLeastRole(session.role, "SUPERVISOR")) {
    throw new Error(message);
  }
}

async function resolveActor(
  session: AppJwtPayload,
  facilityId: string,
  departmentId: string,
  repairId: string,
) {
  return resolveWorkOrderActorAuthority(session, facilityId, departmentId, { repairId });
}

async function operationalEmployeeId(session: AppJwtPayload) {
  return getOperationalEmployeeIdForSession(session);
}

function technicianOwnsLabor(
  session: AppJwtPayload,
  actor: WorkOrderActor,
  repairAssignedEmployeeId: string | null,
  laborEmployeeId: string,
  operationalEmployeeIdValue: string | null,
) {
  if (actor.canManage) return true;
  const assigned = isAssignedWorkOrderTechnician({
    assignedEmployeeId: repairAssignedEmployeeId,
    operationalEmployeeId: operationalEmployeeIdValue,
    sessionUid: session.uid,
    authKind: session.authKind,
  });
  return assigned && operationalEmployeeIdValue === laborEmployeeId;
}

export async function addWorkOrderLabor(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    minutes: number;
    employeeId?: string | null;
    note?: string | null;
    upsertOwn?: boolean;
    client?: DbClient;
  },
) {
  if (!Number.isInteger(input.minutes) || input.minutes < 0) {
    throw new Error("Labor minutes must be a whole number of 0 or more.");
  }
  const client = input.client ?? prisma;
  const actor = await resolveActor(
    session,
    input.facilityId,
    input.departmentId,
    input.repairId,
  );
  const repair = await loadWorkOrderScoped(client, input.repairId, input.facilityId);
  const ownEmployeeId = await operationalEmployeeId(session);

  if (COMPLETED_STATUSES.includes(repair.status)) {
    assertSupervisorPlus(session, "Only a supervisor can correct labor after completion.");
  } else {
    assertActiveWorkOrder(repair.status, "record labor");
  }

  let employeeId = input.employeeId?.trim() || null;
  if (!actor.canManage) {
    if (!ownEmployeeId) throw new Error("Labor must be attributed to your employee record.");
    if (employeeId && employeeId !== ownEmployeeId) {
      throw new Error("Technicians may record only their own labor.");
    }
    employeeId = ownEmployeeId;
    const assigned = isAssignedWorkOrderTechnician({
      assignedEmployeeId: repair.assignedEmployeeId,
      operationalEmployeeId: ownEmployeeId,
      sessionUid: session.uid,
      authKind: session.authKind,
    });
    if (!assigned) throw new Error("Only the assigned technician can record labor.");
  } else if (!employeeId) {
    employeeId = ownEmployeeId ?? repair.assignedEmployeeId;
  }
  if (!employeeId) throw new Error("Labor must be attributed to an employee.");

  const employee = await client.employee.findFirst({
    where: { id: employeeId, facilityId: input.facilityId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!employee) throw new Error("Employee not found.");

  const actorUserId = sessionUserIdForFk(session);
  if (input.upsertOwn && !actor.canManage) {
    const existing = await client.repairLaborEntry.findFirst({
      where: { repairId: repair.id, employeeId },
      orderBy: { recordedAt: "desc" },
    });
    if (existing) {
      const updated = await client.repairLaborEntry.update({
        where: { id: existing.id },
        data: { minutes: input.minutes, note: input.note?.trim() || existing.note },
      });
      if (COMPLETED_STATUSES.includes(repair.status)) {
        await appendRepairUpdate(client, {
          repairId: repair.id,
          updateText: `Labor corrected to ${input.minutes} minutes`,
          statusAfterUpdate: repair.status,
          updatedById: actorUserId,
        });
      }
      return updated;
    }
  }

  const created = await client.repairLaborEntry.create({
    data: {
      id: newWorkOrderCuid(),
      repairId: repair.id,
      employeeId,
      minutes: input.minutes,
      note: input.note?.trim() || null,
      recordedByUserId: actorUserId,
    },
  });
  if (COMPLETED_STATUSES.includes(repair.status)) {
    await appendRepairUpdate(client, {
      repairId: repair.id,
      updateText: `Labor correction: ${input.minutes} minutes for ${employee.firstName} ${employee.lastName}`.trim(),
      statusAfterUpdate: repair.status,
      updatedById: actorUserId,
    });
  }
  return created;
}

export async function updateWorkOrderLabor(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    laborEntryId: string;
    minutes: number;
    note?: string | null;
    client?: DbClient;
  },
) {
  if (!Number.isInteger(input.minutes) || input.minutes < 0) {
    throw new Error("Labor minutes must be a whole number of 0 or more.");
  }
  const client = input.client ?? prisma;
  const actor = await resolveActor(
    session,
    input.facilityId,
    input.departmentId,
    input.repairId,
  );
  const repair = await loadWorkOrderScoped(client, input.repairId, input.facilityId);
  const entry = await client.repairLaborEntry.findFirst({
    where: { id: input.laborEntryId, repairId: repair.id },
  });
  if (!entry) throw new Error("Labor entry not found.");

  if (COMPLETED_STATUSES.includes(repair.status)) {
    assertSupervisorPlus(session, "Only a supervisor can correct labor after completion.");
  } else {
    assertActiveWorkOrder(repair.status, "update labor");
    const ownEmployeeId = await operationalEmployeeId(session);
    if (
      !technicianOwnsLabor(
        session,
        actor,
        repair.assignedEmployeeId,
        entry.employeeId,
        ownEmployeeId,
      )
    ) {
      throw new Error("Technicians may update only their own labor.");
    }
  }

  const updated = await client.repairLaborEntry.update({
    where: { id: entry.id },
    data: {
      minutes: input.minutes,
      note: input.note !== undefined ? input.note?.trim() || null : entry.note,
    },
  });
  if (COMPLETED_STATUSES.includes(repair.status)) {
    await appendRepairUpdate(client, {
      repairId: repair.id,
      updateText: `Labor corrected to ${input.minutes} minutes`,
      statusAfterUpdate: repair.status,
      updatedById: sessionUserIdForFk(session),
    });
  }
  return updated;
}

export async function removeWorkOrderLabor(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    laborEntryId: string;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const actor = await resolveActor(
    session,
    input.facilityId,
    input.departmentId,
    input.repairId,
  );
  const repair = await loadWorkOrderScoped(client, input.repairId, input.facilityId);
  const entry = await client.repairLaborEntry.findFirst({
    where: { id: input.laborEntryId, repairId: repair.id },
  });
  if (!entry) throw new Error("Labor entry not found.");

  if (COMPLETED_STATUSES.includes(repair.status)) {
    assertSupervisorPlus(session, "Only a supervisor can correct labor after completion.");
  } else {
    assertActiveWorkOrder(repair.status, "remove labor");
    const ownEmployeeId = await operationalEmployeeId(session);
    if (
      !technicianOwnsLabor(
        session,
        actor,
        repair.assignedEmployeeId,
        entry.employeeId,
        ownEmployeeId,
      )
    ) {
      throw new Error("Technicians may remove only their own labor.");
    }
  }

  await client.repairLaborEntry.delete({ where: { id: entry.id } });
  if (COMPLETED_STATUSES.includes(repair.status)) {
    await appendRepairUpdate(client, {
      repairId: repair.id,
      updateText: "Labor entry removed",
      statusAfterUpdate: repair.status,
      updatedById: sessionUserIdForFk(session),
    });
  }
}

export async function addWorkOrderPart(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    description: string;
    partNumber?: string | null;
    quantity: string | Prisma.Decimal;
    lineCost?: string | Prisma.Decimal | null;
    client?: DbClient;
  },
) {
  const description = input.description.trim();
  if (!description) throw new Error("Part description is required.");
  const quantity =
    typeof input.quantity === "string"
      ? parsePositiveQuantity(input.quantity)
      : input.quantity;
  if (quantity.lte(0)) throw new Error("Part quantity must be greater than zero.");
  let lineCost: Prisma.Decimal | null = null;
  if (input.lineCost != null && input.lineCost !== "") {
    lineCost =
      typeof input.lineCost === "string"
        ? parseNonNegativeDecimal(input.lineCost, 2)
        : input.lineCost;
    if (lineCost.lt(0)) throw new Error("Negative maintenance costs are not allowed.");
  }

  const client = input.client ?? prisma;
  const actor = await resolveActor(
    session,
    input.facilityId,
    input.departmentId,
    input.repairId,
  );
  const repair = await loadWorkOrderScoped(client, input.repairId, input.facilityId);
  if (COMPLETED_STATUSES.includes(repair.status)) {
    assertSupervisorPlus(session, "Only a supervisor can correct parts after completion.");
  } else {
    assertActiveWorkOrder(repair.status, "add parts");
    if (!actor.canManage) {
      const ownEmployeeId = await operationalEmployeeId(session);
      const assigned = isAssignedWorkOrderTechnician({
        assignedEmployeeId: repair.assignedEmployeeId,
        operationalEmployeeId: ownEmployeeId,
        sessionUid: session.uid,
        authKind: session.authKind,
      });
      if (!assigned) throw new Error("Only the assigned technician can add parts.");
    }
  }

  const created = await client.repairPartUsed.create({
    data: {
      id: newWorkOrderCuid(),
      repairId: repair.id,
      description,
      partNumber: input.partNumber?.trim() || null,
      quantity,
      lineCost,
      createdByUserId: sessionUserIdForFk(session),
    },
  });
  if (COMPLETED_STATUSES.includes(repair.status)) {
    await appendRepairUpdate(client, {
      repairId: repair.id,
      updateText: `Part added: ${description}`,
      statusAfterUpdate: repair.status,
      updatedById: sessionUserIdForFk(session),
    });
  }
  return created;
}

export async function updateWorkOrderPart(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    partId: string;
    description?: string;
    partNumber?: string | null;
    quantity?: string | Prisma.Decimal;
    lineCost?: string | Prisma.Decimal | null;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const actor = await resolveActor(
    session,
    input.facilityId,
    input.departmentId,
    input.repairId,
  );
  const repair = await loadWorkOrderScoped(client, input.repairId, input.facilityId);
  const part = await client.repairPartUsed.findFirst({
    where: { id: input.partId, repairId: repair.id },
  });
  if (!part) throw new Error("Part not found.");

  if (COMPLETED_STATUSES.includes(repair.status)) {
    assertSupervisorPlus(session, "Only a supervisor can correct parts after completion.");
  } else {
    assertActiveWorkOrder(repair.status, "update parts");
    if (!actor.canManage) {
      const ownEmployeeId = await operationalEmployeeId(session);
      const assigned = isAssignedWorkOrderTechnician({
        assignedEmployeeId: repair.assignedEmployeeId,
        operationalEmployeeId: ownEmployeeId,
        sessionUid: session.uid,
        authKind: session.authKind,
      });
      if (!assigned) throw new Error("Only the assigned technician can update parts.");
    }
  }

  const data: Prisma.RepairPartUsedUpdateInput = {};
  if (input.description !== undefined) {
    const description = input.description.trim();
    if (!description) throw new Error("Part description is required.");
    data.description = description;
  }
  if (input.partNumber !== undefined) data.partNumber = input.partNumber?.trim() || null;
  if (input.quantity !== undefined) {
    data.quantity =
      typeof input.quantity === "string"
        ? parsePositiveQuantity(input.quantity)
        : input.quantity;
  }
  if (input.lineCost !== undefined) {
    if (input.lineCost == null || input.lineCost === "") data.lineCost = null;
    else {
      data.lineCost =
        typeof input.lineCost === "string"
          ? parseNonNegativeDecimal(input.lineCost, 2)
          : input.lineCost;
    }
  }

  const updated = await client.repairPartUsed.update({ where: { id: part.id }, data });
  if (COMPLETED_STATUSES.includes(repair.status)) {
    await appendRepairUpdate(client, {
      repairId: repair.id,
      updateText: `Part corrected: ${updated.description}`,
      statusAfterUpdate: repair.status,
      updatedById: sessionUserIdForFk(session),
    });
  }
  return updated;
}

export async function removeWorkOrderPart(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    partId: string;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const actor = await resolveActor(
    session,
    input.facilityId,
    input.departmentId,
    input.repairId,
  );
  const repair = await loadWorkOrderScoped(client, input.repairId, input.facilityId);
  const part = await client.repairPartUsed.findFirst({
    where: { id: input.partId, repairId: repair.id },
  });
  if (!part) throw new Error("Part not found.");

  if (COMPLETED_STATUSES.includes(repair.status)) {
    assertSupervisorPlus(session, "Only a supervisor can correct parts after completion.");
  } else {
    assertActiveWorkOrder(repair.status, "remove parts");
    if (!actor.canManage) {
      const ownEmployeeId = await operationalEmployeeId(session);
      const assigned = isAssignedWorkOrderTechnician({
        assignedEmployeeId: repair.assignedEmployeeId,
        operationalEmployeeId: ownEmployeeId,
        sessionUid: session.uid,
        authKind: session.authKind,
      });
      if (!assigned) throw new Error("Only the assigned technician can remove parts.");
    }
  }

  await client.repairPartUsed.delete({ where: { id: part.id } });
  if (COMPLETED_STATUSES.includes(repair.status)) {
    await appendRepairUpdate(client, {
      repairId: repair.id,
      updateText: `Part removed: ${part.description}`,
      statusAfterUpdate: repair.status,
      updatedById: sessionUserIdForFk(session),
    });
  }
}

export async function setWorkOrderExternalCost(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    vendorId?: string | null;
    externalCost?: string | Prisma.Decimal | null;
    externalCostNote?: string | null;
    client?: DbClient;
  },
) {
  assertSupervisorPlus(session, "Technicians cannot edit vendor or recorded expense.");
  const client = input.client ?? prisma;
  await resolveActor(session, input.facilityId, input.departmentId, input.repairId);
  const repair = await loadWorkOrderScoped(client, input.repairId, input.facilityId);
  if (repair.status === "CANCELLED") {
    throw new Error("Cancelled Work Orders cannot record expense.");
  }

  let vendorId = repair.vendorId;
  if (input.vendorId !== undefined) {
    if (input.vendorId) {
      const vendor = await client.vendor.findFirst({
        where: { id: input.vendorId, facilityId: input.facilityId },
        select: { id: true },
      });
      if (!vendor) throw new Error("Vendor not found.");
      vendorId = vendor.id;
    } else {
      vendorId = null;
    }
  }

  let externalCost = repair.externalCost;
  if (input.externalCost !== undefined) {
    if (input.externalCost == null || input.externalCost === "") externalCost = null;
    else {
      externalCost =
        typeof input.externalCost === "string"
          ? parseNonNegativeDecimal(input.externalCost, 2)
          : input.externalCost;
      if (externalCost.lt(0)) throw new Error("Negative maintenance costs are not allowed.");
    }
  }

  const updated = await client.repair.update({
    where: { id: repair.id },
    data: {
      vendorId,
      externalCost,
      externalCostNote:
        input.externalCostNote !== undefined
          ? input.externalCostNote?.trim() || null
          : repair.externalCostNote,
    },
  });
  await appendRepairUpdate(client, {
    repairId: repair.id,
    updateText: COMPLETED_STATUSES.includes(repair.status)
      ? "Recorded material & vendor expense corrected"
      : "Recorded material & vendor expense updated",
    statusAfterUpdate: repair.status,
    updatedById: sessionUserIdForFk(session),
  });
  return updated;
}

export async function addWorkOrderRecordRequirement(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    templateId: string;
    client?: DbClient;
  },
) {
  assertSupervisorPlus(session, "Technicians cannot configure required Records.");
  const client = input.client ?? prisma;
  await resolveActor(session, input.facilityId, input.departmentId, input.repairId);
  const repair = await loadWorkOrderScoped(client, input.repairId, input.facilityId);
  if (COMPLETED_STATUSES.includes(repair.status) || repair.status === "CANCELLED") {
    throw new Error("Required Records cannot be added after completion.");
  }
  assertActiveWorkOrder(repair.status, "add required Records");

  const template = await client.operationalTemplate.findFirst({
    where: { id: input.templateId, facilityId: input.facilityId },
  });
  if (!template) throw new Error("Record template not found.");
  if (template.status !== "PUBLISHED") {
    throw new Error("Required Records must pin a published template version.");
  }
  if (
    repair.responsibleDepartmentId &&
    template.departmentId !== repair.responsibleDepartmentId &&
    template.departmentId !== input.departmentId
  ) {
    throw new Error("Required Record template is outside this Work Order department.");
  }

  const existing = await client.repairRecordRequirement.findFirst({
    where: { repairId: repair.id, templateId: template.id },
  });
  if (existing) throw new Error("That required Record is already attached.");

  const last = await client.repairRecordRequirement.findFirst({
    where: { repairId: repair.id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const created = await client.repairRecordRequirement.create({
    data: {
      id: newWorkOrderCuid(),
      repairId: repair.id,
      templateId: template.id,
      templateStableKey: template.stableKey,
      templateVersion: template.version,
      templateName: template.name,
      sortOrder: (last?.sortOrder ?? 0) + 1,
      createdByUserId: sessionUserIdForFk(session),
    },
  });
  await appendRepairUpdate(client, {
    repairId: repair.id,
    updateText: `Required Record added: ${template.name} v${template.version}`,
    statusAfterUpdate: repair.status,
    updatedById: sessionUserIdForFk(session),
  });
  return created;
}

export async function removeWorkOrderRecordRequirement(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    requirementId: string;
    client?: DbClient;
  },
) {
  assertSupervisorPlus(session, "Technicians cannot configure required Records.");
  const client = input.client ?? prisma;
  await resolveActor(session, input.facilityId, input.departmentId, input.repairId);
  const repair = await loadWorkOrderScoped(client, input.repairId, input.facilityId);
  if (COMPLETED_STATUSES.includes(repair.status)) {
    throw new Error("Required Records cannot be removed after completion.");
  }
  const requirement = await client.repairRecordRequirement.findFirst({
    where: { id: input.requirementId, repairId: repair.id },
  });
  if (!requirement) throw new Error("Required Record not found.");
  await client.repairRecordRequirement.delete({ where: { id: requirement.id } });
  await appendRepairUpdate(client, {
    repairId: repair.id,
    updateText: `Required Record removed: ${requirement.templateName}`,
    statusAfterUpdate: repair.status,
    updatedById: sessionUserIdForFk(session),
  });
}

export async function satisfyWorkOrderRecordRequirement(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    requirementId: string;
    evidenceRecordId: string;
    client?: DbClient;
  },
) {
  const client = input.client ?? prisma;
  const actor = await resolveActor(
    session,
    input.facilityId,
    input.departmentId,
    input.repairId,
  );
  const repair = await loadWorkOrderScoped(client, input.repairId, input.facilityId);
  if (COMPLETED_STATUSES.includes(repair.status)) {
    throw new Error("Required Records cannot be changed after completion.");
  }
  if (!actor.canManage) {
    const ownEmployeeId = await operationalEmployeeId(session);
    const assigned = isAssignedWorkOrderTechnician({
      assignedEmployeeId: repair.assignedEmployeeId,
      operationalEmployeeId: ownEmployeeId,
      sessionUid: session.uid,
      authKind: session.authKind,
    });
    if (!assigned) throw new Error("Only the assigned technician can satisfy required Records.");
  }

  const requirement = await client.repairRecordRequirement.findFirst({
    where: { id: input.requirementId, repairId: repair.id },
  });
  if (!requirement) throw new Error("Required Record not found.");
  if (requirement.status === "WAIVED") {
    throw new Error("A waived requirement cannot be satisfied with a Record.");
  }

  const record = await client.operationalEvidenceRecord.findFirst({
    where: { id: input.evidenceRecordId, facilityId: input.facilityId },
  });
  if (!record) throw new Error("Record not found.");
  if (record.templateId !== requirement.templateId) {
    throw new Error("Record does not match the pinned required template.");
  }
  if (record.templateVersion !== requirement.templateVersion) {
    throw new Error("Record does not match the pinned template version.");
  }
  if (
    record.status !== "COMPLETED" &&
    record.status !== "COMPLETED_WITH_CORRECTIVE_ACTION"
  ) {
    throw new Error("Only a completed Record can satisfy a required evidence item.");
  }

  const existingLink = await client.repairEvidenceLink.findFirst({
    where: { repairId: repair.id, evidenceRecordId: record.id },
    select: { id: true },
  });
  if (!existingLink) {
    await client.repairEvidenceLink.create({
      data: {
        id: newWorkOrderCuid(),
        repairId: repair.id,
        evidenceRecordId: record.id,
        linkedByUserId: sessionUserIdForFk(session),
      },
    });
  }

  const updated = await client.repairRecordRequirement.update({
    where: { id: requirement.id },
    data: {
      status: "SATISFIED",
      satisfiedByRecordId: record.id,
    },
  });
  await appendRepairUpdate(client, {
    repairId: repair.id,
    updateText: `Required Record satisfied: ${requirement.templateName}`,
    statusAfterUpdate: repair.status,
    updatedById: sessionUserIdForFk(session),
  });
  return { requirement: updated, record };
}

export async function waiveWorkOrderRecordRequirement(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    requirementId: string;
    waiveReason: string;
    client?: DbClient;
    now?: Date;
  },
) {
  assertSupervisorPlus(session, "Technicians cannot waive required Records.");
  const reason = input.waiveReason.trim();
  if (reason.length < WAIVE_REASON_MIN_LENGTH) {
    throw new Error("A meaningful waiver reason is required.");
  }
  const client = input.client ?? prisma;
  await resolveActor(session, input.facilityId, input.departmentId, input.repairId);
  const repair = await loadWorkOrderScoped(client, input.repairId, input.facilityId);
  if (COMPLETED_STATUSES.includes(repair.status)) {
    throw new Error("Required Records cannot be waived after completion.");
  }
  const requirement = await client.repairRecordRequirement.findFirst({
    where: { id: input.requirementId, repairId: repair.id },
  });
  if (!requirement) throw new Error("Required Record not found.");

  const now = input.now ?? new Date();
  const updated = await client.repairRecordRequirement.update({
    where: { id: requirement.id },
    data: {
      status: "WAIVED",
      waivedAt: now,
      waivedByUserId: sessionUserIdForFk(session),
      waiveReason: reason,
      satisfiedByRecordId: null,
    },
  });
  await appendRepairUpdate(client, {
    repairId: repair.id,
    updateText: `Required Record waived: ${requirement.templateName}. ${reason}`,
    statusAfterUpdate: repair.status,
    updatedById: sessionUserIdForFk(session),
  });
  return updated;
}

export async function loadWorkOrderCloseout(client: DbClient, repairId: string) {
  const [repair, facts] = await Promise.all([
    client.repair.findFirst({
      where: { id: repairId },
      select: { externalCost: true },
    }),
    loadCloseoutFacts(client, repairId),
  ]);
  const expense = projectRecordedExpense({
    parts: facts.partsUsed,
    externalCost: repair?.externalCost ?? null,
  });
  return { ...facts, expense };
}

export async function applyWorkOrderCloseoutCompletion(
  session: AppJwtPayload,
  input: {
    facilityId: string;
    departmentId: string;
    repairId: string;
    workPerformed?: string | null;
    resolution?: string | null;
    followUpRequired?: boolean;
    followUpNote?: string | null;
    comment?: string | null;
    assetConditionReview?: RepairAssetConditionReviewChoice | null;
    requesterVisible?: boolean;
    client: DbClient;
    now?: Date;
  },
) {
  await resolveWorkOrderActorAuthority(session, input.facilityId, input.departmentId, {
    repairId: input.repairId,
  });
  const repair = await loadWorkOrderScoped(input.client, input.repairId, input.facilityId);
  if (repair.status === "COMPLETED" || repair.status === "CLOSED") {
    return repair;
  }
  if (repair.status === "CANCELLED") {
    throw new Error("Cancelled Work Orders cannot be completed.");
  }
  if (!ACTIVE_CLOSEOUT_STATUSES.includes(repair.status)) {
    throw new Error(`Cannot complete Work Order from status ${repair.status}.`);
  }

  const workPerformed =
    input.workPerformed?.trim() || repair.workPerformed?.trim() || "";
  const review = input.assetConditionReview ?? repair.assetConditionReview ?? null;
  if (!repair.assetId && review) {
    throw new Error("Location-only Work Orders do not include Asset condition review.");
  }

  const facts = await loadCloseoutFacts(input.client, repair.id);
  const validation = validateWorkOrderCloseout({
    workPerformed,
    laborEntryCount: facts.laborEntries.length,
    requirements: facts.recordRequirements,
    hasAsset: Boolean(repair.assetId),
    assetConditionReview: review,
  });
  if (!validation.canComplete) {
    throw new Error(formatWorkOrderCloseoutBlockedMessage(validation));
  }

  const actorUserId = sessionUserIdForFk(session);
  const now = input.now ?? new Date();

  if (
    repair.assetId &&
    review &&
    review !== "NO_CHANGE"
  ) {
    await changeAssetStatus(session, {
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      assetId: repair.assetId,
      toStatus: review,
      reason: "MANUAL",
      note: "Work Order closeout condition review",
      sourceRepairId: repair.id,
      sourceIssueId: repair.issueId,
      client: input.client,
      now,
      allowWorkOrderCloseoutTechnician: true,
    });
  }

  const updated = await input.client.repair.update({
    where: { id: repair.id },
    data: {
      status: "COMPLETED",
      holdReason: null,
      completedAt: now,
      startedAt: repair.startedAt ?? now,
      workPerformed,
      resolution: input.resolution?.trim() || repair.resolution,
      followUpRequired: input.followUpRequired ?? repair.followUpRequired,
      followUpNote:
        input.followUpNote !== undefined
          ? input.followUpNote?.trim() || null
          : repair.followUpNote,
      assetConditionReview: repair.assetId ? review : null,
      assetConditionReviewedAt: repair.assetId ? now : null,
      assetConditionReviewedByUserId: repair.assetId ? actorUserId : null,
    },
  });

  await appendRepairUpdate(input.client, {
    repairId: repair.id,
    updateText:
      input.comment?.trim() ||
      input.resolution?.trim() ||
      "Work Order completed",
    statusAfterUpdate: "COMPLETED",
    updatedById: actorUserId,
    requesterVisible: input.requesterVisible ?? false,
  });

  await completePmOccurrenceForWorkOrder(input.client, updated, now);

  return updated;
}
