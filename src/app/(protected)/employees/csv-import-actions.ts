"use server";

import { revalidatePath } from "next/cache";
import { EmployeeStatus, Prisma, SeparationKind, type WorkStation } from "@prisma/client";

import { requireAtLeastRole } from "@/lib/access";
import { parseCsv } from "@/lib/csv-parse";
import { mapHeaders, parseEmployeeRow, type ParsedCsvEmployeeRow } from "@/lib/employee-csv-import";
import { buildTerminationSnapshotJson } from "@/lib/hr-audit";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";

const MAX_BYTES = 2_000_000;
const MAX_ROWS = 500;

export type CsvImportResult = {
  created: number;
  updated: number;
  errors: { row: number; message: string }[];
};

function revalidateEmployeeViews() {
  revalidatePath("/employees");
  revalidatePath("/employees/points-summary");
  revalidatePath("/employees/hr-audit");
  revalidatePath("/employees/separations");
  revalidatePath("/employees/terminations");
  revalidatePath("/staffing");
  revalidatePath("/dashboard");
  revalidatePath("/employees/import");
}

async function syncWorkStationsTx(
  tx: Prisma.TransactionClient,
  employeeId: string,
  stations: WorkStation[],
) {
  await tx.employeeWorkStation.deleteMany({ where: { employeeId } });
  if (stations.length === 0) return;
  await tx.employeeWorkStation.createMany({
    data: stations.map((station) => ({ employeeId, station })),
  });
}

async function findExistingEmployee(
  facilityId: string,
  row: ParsedCsvEmployeeRow,
): Promise<{ id: string } | null | { error: string }> {
  if (row.email) {
    const list = await prisma.employee.findMany({
      where: { facilityId, email: { equals: row.email, mode: "insensitive" } },
      take: 2,
      select: { id: true },
    });
    if (list.length > 1) return { error: "Multiple employees share this email; fix the roster before import." };
    if (list.length === 1) return { id: list[0]!.id };
  }

  const byName = await prisma.employee.findMany({
    where: {
      facilityId,
      firstName: { equals: row.firstName, mode: "insensitive" },
      lastName: { equals: row.lastName, mode: "insensitive" },
    },
    take: 2,
    select: { id: true },
  });
  if (byName.length > 1) {
    return {
      error:
        "Multiple employees match this name; add a unique email column on each row to pick the right person.",
    };
  }
  if (byName.length === 1) return { id: byName[0]!.id };
  return null;
}

function resolvePrimaryUnitId(
  row: ParsedCsvEmployeeRow,
  unitByName: Map<string, string>,
  activeColumns: Set<string>,
): { primaryUnitId?: string | null; error?: string } {
  if (!activeColumns.has("primaryUnit")) return {};
  if (!row.primaryUnitName?.trim()) return { primaryUnitId: null };
  const id = unitByName.get(row.primaryUnitName.trim().toLowerCase());
  if (!id) return { error: `Unknown unit "${row.primaryUnitName}".` };
  return { primaryUnitId: id };
}

export async function importEmployeesFromCsvAction(formData: FormData): Promise<CsvImportResult> {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    throw new Error("Choose a CSV file.");
  }

  const text = await file.text();
  if (text.length > MAX_BYTES) {
    throw new Error("File too large (max 2 MB).");
  }

  const { headers, rows } = parseCsv(text);
  if (headers.length === 0) {
    throw new Error("No header row found.");
  }
  if (rows.length > MAX_ROWS) {
    throw new Error(`Too many rows (max ${MAX_ROWS}).`);
  }

  const colMap = mapHeaders(headers);
  if (colMap.size === 0) {
    throw new Error("No recognized columns. You need at least firstName and lastName headers.");
  }

  const activeColumns = new Set(colMap.values());

  const facilityId = session.facilityId;
  const uid = session.uid || undefined;

  const units = await prisma.unit.findMany({
    where: { facilityId, isActive: true },
    select: { id: true, name: true },
  });
  const unitByName = new Map(units.map((u) => [u.name.trim().toLowerCase(), u.id]));

  let created = 0;
  let updated = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const rawCells = rows[i] ?? [];
    const cells = rawCells.slice(0, headers.length);
    while (cells.length < headers.length) cells.push("");

    const parsed = parseEmployeeRow(cells, colMap);
    if (!parsed.ok) {
      errors.push({ row: rowNum, message: parsed.error });
      continue;
    }

    const row = parsed.value;

    const primary = resolvePrimaryUnitId(row, unitByName, activeColumns);
    if (primary.error) {
      errors.push({ row: rowNum, message: primary.error });
      continue;
    }

    try {
      const match = await findExistingEmployee(facilityId, row);
      if (match !== null && "error" in match) {
        errors.push({ row: rowNum, message: match.error });
        continue;
      }

      if (match === null) {
        if (row.status === EmployeeStatus.TERMINATED) {
          errors.push({
            row: rowNum,
            message:
              "Cannot create a new employee as TERMINATED. Use ACTIVE or OFF, then terminate in the app or re-import with an update row.",
          });
          continue;
        }

        await prisma.$transaction(async (tx) => {
          const emp = await tx.employee.create({
            data: {
              facilityId,
              firstName: row.firstName,
              lastName: row.lastName,
              email: row.email,
              phone: row.phone,
              roleType: row.roleType,
              employmentType: row.employmentType,
              status: row.status,
              unionMember: row.unionMember,
              onLeave: row.onLeave,
              hireDate: row.hireDate,
              birthMonth: row.birthMonth,
              birthDay: row.birthDay,
              jobClassification: row.jobClassification,
              chrcStatus: row.chrcStatus,
              chrcClearedAt: row.chrcClearedAt,
              chrcNotes: row.chrcNotes,
              shirtSize: row.shirtSize,
              hrNotes: row.hrNotes,
              primaryUnitId: primary.primaryUnitId ?? null,
            } as Prisma.EmployeeUncheckedCreateInput,
          });
          await syncWorkStationsTx(tx, emp.id, row.workStations);
        });
        created++;
        continue;
      }

      const employeeId = match.id;

      await prisma.$transaction(async (tx) => {
        const before = await tx.employee.findFirst({
          where: { id: employeeId, facilityId },
          include: { workStations: { select: { station: true } } },
        });
        if (!before) {
          throw new Error("Employee not found.");
        }

        const terminated = row.status === EmployeeStatus.TERMINATED;
        const transitionToTerminated =
          before.status !== EmployeeStatus.TERMINATED && row.status === EmployeeStatus.TERMINATED;

        const updateData: Prisma.EmployeeUncheckedUpdateInput = {
          firstName: row.firstName,
          lastName: row.lastName,
          email: row.email,
          phone: row.phone,
          roleType: row.roleType,
          employmentType: row.employmentType,
          status: row.status,
          unionMember: row.unionMember,
          onLeave: row.onLeave,
          hireDate: row.hireDate,
          birthMonth: row.birthMonth,
          birthDay: row.birthDay,
          jobClassification: row.jobClassification,
          chrcStatus: row.chrcStatus,
          chrcClearedAt: row.chrcClearedAt,
          chrcNotes: row.chrcNotes,
          shirtSize: row.shirtSize,
          hrNotes: row.hrNotes,
          ...(activeColumns.has("primaryUnit") ? { primaryUnitId: primary.primaryUnitId ?? null } : {}),
          ...(terminated
            ? {
                terminationDate: row.terminationDate,
                chrcOffboardingCompletedAt: row.chrcOffboardingCompletedAt,
                chrcOffboardingNotes: row.chrcOffboardingNotes,
              }
            : {
                terminationDate: null,
                chrcOffboardingCompletedAt: null,
                chrcOffboardingNotes: null,
              }),
        };

        await tx.employee.update({
          where: { id: employeeId },
          data: updateData,
        });

        if (transitionToTerminated) {
          const fresh = await tx.employee.findUnique({
            where: { id: employeeId },
            include: { workStations: { select: { station: true } } },
          });
          if (fresh) {
            const td = row.terminationDate ?? new Date();
            const terminatedAt = new Date(Date.UTC(td.getUTCFullYear(), td.getUTCMonth(), td.getUTCDate()));
            await tx.employeeTerminationRecord.create({
              data: {
                facilityId,
                employeeId,
                terminatedAt,
                lastShiftWorkedAt: null,
                separationKind: SeparationKind.TERMINATED,
                wouldRehire: null,
                snapshotJson: buildTerminationSnapshotJson(fresh),
                createdByUserId: uid ?? null,
              },
            });
          }
        }

        await syncWorkStationsTx(tx, employeeId, row.workStations);
      });

      updated++;
    } catch (e) {
      errors.push({
        row: rowNum,
        message: e instanceof Error ? e.message : "Import failed for this row.",
      });
    }
  }

  revalidateEmployeeViews();

  return { created, updated, errors };
}
