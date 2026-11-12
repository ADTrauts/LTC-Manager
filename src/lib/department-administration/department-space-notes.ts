/**
 * Department × Space descriptive notes (Phase 2D-3).
 *
 * Notes live on UnitSpaceResponsibility — membership-bound descriptive metadata.
 * They are never operational configuration and must not invent due/overdue/uncovered state.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export const DEPARTMENT_SPACE_NOTE_MAX_LENGTH = 2000;

export type DepartmentSpaceNoteRow = {
  spaceId: string;
  departmentId: string;
  notes: string | null;
};

export function normalizeDepartmentSpaceNote(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function assertDepartmentSpaceNoteLength(note: string | null): void {
  if (note != null && note.length > DEPARTMENT_SPACE_NOTE_MAX_LENGTH) {
    throw new Error(`Department room note must be ${DEPARTMENT_SPACE_NOTE_MAX_LENGTH} characters or fewer.`);
  }
}

/**
 * Load notes for one Department and an explicit Space set only.
 * Never returns another Department's notes for the same Spaces.
 */
export async function loadDepartmentSpaceNotes(
  db: Db,
  input: {
    facilityId: string;
    departmentId: string;
    spaceIds: readonly string[];
  },
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (input.spaceIds.length === 0) return result;

  const rows = await db.unitSpaceResponsibility.findMany({
    where: {
      departmentId: input.departmentId,
      spaceId: { in: [...input.spaceIds] },
      space: { facilityId: input.facilityId },
    },
    select: { spaceId: true, notes: true },
  });

  for (const row of rows) {
    result.set(row.spaceId, row.notes ?? null);
  }
  return result;
}

/**
 * Update the optional note for an existing Department × Space responsibility.
 * Does not create membership. Does not touch Facility UnitSpace.description or other Departments.
 */
export async function updateDepartmentSpaceNote(
  db: Db,
  input: {
    facilityId: string;
    departmentId: string;
    spaceId: string;
    notes: string | null | undefined;
  },
): Promise<DepartmentSpaceNoteRow> {
  const department = await db.department.findFirst({
    where: { id: input.departmentId, facilityId: input.facilityId, isActive: true },
    select: { id: true },
  });
  if (!department) throw new Error("Department not found.");

  const space = await db.unitSpace.findFirst({
    where: { id: input.spaceId, facilityId: input.facilityId },
    select: { id: true },
  });
  if (!space) throw new Error("Room not found in this Facility.");

  const existing = await db.unitSpaceResponsibility.findUnique({
    where: {
      spaceId_departmentId: { spaceId: space.id, departmentId: department.id },
    },
    select: { id: true, spaceId: true, departmentId: true, notes: true },
  });
  if (!existing) {
    throw new Error("This Department is not responsible for that room.");
  }

  const notes = normalizeDepartmentSpaceNote(input.notes);
  assertDepartmentSpaceNoteLength(notes);

  const updated = await db.unitSpaceResponsibility.update({
    where: { id: existing.id },
    data: { notes },
    select: { spaceId: true, departmentId: true, notes: true },
  });

  return updated;
}
