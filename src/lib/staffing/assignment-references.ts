import type { PrismaClient } from "@prisma/client";

import { toServiceDateKey } from "@/lib/operational-time";

/**
 * Why a submitted reference was refused.
 *
 * Every out-of-scope case reports "not found" to the caller rather than "forbidden", so the action
 * cannot be used to confirm that another facility's or department's object exists.
 */
export type AssignmentReferenceRejection =
  | "UNIT_NOT_FOUND"
  | "OPERATION_NOT_FOUND"
  | "OPERATION_DEPARTMENT_MISMATCH"
  | "OPERATION_DATE_MISMATCH"
  | "UNIT_OPERATION_MISMATCH";

export type AssignmentReferenceResult =
  | { ok: true; unitId: string | null; operationInstanceId: string | null }
  | { ok: false; reason: AssignmentReferenceRejection };

/** Operator-facing text. Deliberately uniform for every out-of-scope case. */
export function describeAssignmentReferenceRejection(
  reason: AssignmentReferenceRejection,
): string {
  switch (reason) {
    case "UNIT_NOT_FOUND":
      return "Unit not found.";
    case "OPERATION_NOT_FOUND":
    case "OPERATION_DEPARTMENT_MISMATCH":
    case "OPERATION_DATE_MISMATCH":
      return "Operation not found.";
    case "UNIT_OPERATION_MISMATCH":
      return "That unit does not run this operation.";
  }
}

/**
 * Validate the Unit and OperationInstance an assignment write is about to connect.
 *
 * These actions are exported Server Actions. The feature they belong to is switched off, but a
 * disabled interface does not make an exported action unreachable, so the write boundary has to
 * hold on its own against a directly-posted form.
 *
 * Every dimension the schema actually expresses is checked: facility, department, and service date
 * are columns on `OperationInstance`, and unit-to-department coherence comes from
 * `UnitDepartmentResponsibility`. Nothing beyond that is inferred — where the schema does not
 * record a relationship, this does not invent one.
 */
export async function resolveAssignmentReferences(
  client: PrismaClient,
  input: {
    facilityId: string;
    /** Department the assignment belongs to. Already validated in the facility by the caller. */
    departmentId: string;
    /**
     * Operational day of the assignment as a YYYY-MM-DD key.
     *
     * A key rather than a `Date` because the two callers hold it in different forms — one has the
     * submitted string, the other a stored `@db.Date` — and normalizing at the boundary avoids a
     * comparison that silently depends on which one was converted through local midnight.
     */
    serviceDateKey: string;
    unitId?: string | null;
    operationInstanceId?: string | null;
  },
): Promise<AssignmentReferenceResult> {
  const unitId = input.unitId || null;
  const operationInstanceId = input.operationInstanceId || null;

  if (unitId) {
    const unit = await client.unit.findFirst({
      where: { id: unitId, facilityId: input.facilityId },
      select: { id: true },
    });
    if (!unit) {
      return { ok: false, reason: "UNIT_NOT_FOUND" };
    }
  }

  if (!operationInstanceId) {
    return { ok: true, unitId, operationInstanceId: null };
  }

  const operation = await client.operationInstance.findFirst({
    where: { id: operationInstanceId, facilityId: input.facilityId },
    select: { id: true, departmentId: true, serviceDate: true },
  });
  if (!operation) {
    return { ok: false, reason: "OPERATION_NOT_FOUND" };
  }

  // An assignment in one department must not be attached to another department's operation, even
  // within the same facility.
  if (operation.departmentId !== input.departmentId) {
    return { ok: false, reason: "OPERATION_DEPARTMENT_MISMATCH" };
  }

  // Attaching Monday's assignment to Tuesday's operation would silently misfile the work.
  if (toServiceDateKey(operation.serviceDate) !== input.serviceDateKey) {
    return { ok: false, reason: "OPERATION_DATE_MISMATCH" };
  }

  if (unitId) {
    // Units carry department responsibilities rather than a single department column. When a unit
    // declares them, the operation's department must be among them. A unit that declares none is
    // treated as unrestricted, which is how the rest of the product reads a legacy unit — a
    // missing declaration is not evidence of exclusion.
    const responsibilities = await client.unitDepartmentResponsibility.findMany({
      where: { unitId },
      select: { departmentId: true },
    });
    if (
      responsibilities.length > 0 &&
      !responsibilities.some((row) => row.departmentId === operation.departmentId)
    ) {
      return { ok: false, reason: "UNIT_OPERATION_MISMATCH" };
    }
  }

  return { ok: true, unitId, operationInstanceId };
}
