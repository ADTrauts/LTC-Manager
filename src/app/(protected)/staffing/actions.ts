"use server";

import { revalidatePath } from "next/cache";
import { MealType, RoleKey, ShiftType } from "@prisma/client";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";
import { isEmployeeEligibleForUnit } from "@/lib/scheduling-eligibility";

const roleKeyValues = [
  RoleKey.GM,
  RoleKey.MANAGER,
  RoleKey.SUPERVISOR,
  RoleKey.LEAD_TEAM_MEMBER,
  RoleKey.STAFF,
] as const;
const shiftValues = [ShiftType.BREAKFAST, ShiftType.LUNCH, ShiftType.DINNER, ShiftType.FULL_DAY] as const;
const mealValues = [MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER] as const;

const createScheduleEntrySchema = z.object({
  employeeId: z.string().cuid(),
  unitId: z.string().cuid(),
  date: z.string().min(8),
  shift: z.enum(shiftValues),
  roleType: z.enum(roleKeyValues).optional(),
  plannedStart: z.string().optional(),
  plannedEnd: z.string().optional(),
});

const createOverrideSchema = z.object({
  scheduleEntryId: z.string().cuid().optional(),
  employeeId: z.string().cuid(),
  oldUnitId: z.string().cuid().optional(),
  newUnitId: z.string().cuid(),
  date: z.string().min(8),
  mealType: z.enum(mealValues).optional(),
  reason: z.string().trim().min(3).max(300),
});

function toOptional(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function toOptionalRoleKey(value: FormDataEntryValue | null): RoleKey | undefined {
  const maybe = toOptional(value);
  if (!maybe) return undefined;
  return roleKeyValues.includes(maybe as RoleKey) ? (maybe as RoleKey) : undefined;
}

function parseDate(raw: string) {
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const parsed = new Date(
      Number.parseInt(match[1], 10),
      Number.parseInt(match[2], 10) - 1,
      Number.parseInt(match[3], 10),
      0,
      0,
      0,
      0,
    );
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date.");
  }
  return parsed;
}

function revalidateStaffingViews() {
  revalidatePath("/staffing");
  revalidatePath("/dashboard");
  revalidatePath("/unit/[unitId]", "page");
}

export async function deleteScheduleEntryAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");

  const scheduleEntryId = formData.get("scheduleEntryId");
  if (typeof scheduleEntryId !== "string" || scheduleEntryId.trim().length === 0) {
    throw new Error("Schedule entry is required.");
  }

  const entry = await prisma.scheduleEntry.findFirst({
    where: {
      id: scheduleEntryId,
      employee: { facilityId: session.facilityId },
    },
    select: { id: true },
  });
  if (!entry) {
    throw new Error("Schedule entry not found.");
  }

  await prisma.scheduleEntry.delete({ where: { id: entry.id } });
  revalidateStaffingViews();
}

export async function createScheduleEntryAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");

  const parsed = createScheduleEntrySchema.parse({
    employeeId: formData.get("employeeId"),
    unitId: formData.get("unitId"),
    date: formData.get("date"),
    shift: formData.get("shift"),
    roleType: toOptionalRoleKey(formData.get("roleType")),
    plannedStart: toOptional(formData.get("plannedStart")),
    plannedEnd: toOptional(formData.get("plannedEnd")),
  });

  const [employee, unit] = await Promise.all([
    prisma.employee.findFirst({
      where: { id: parsed.employeeId, facilityId: session.facilityId },
      select: {
        id: true,
        roleType: true,
        workStations: { select: { station: true } },
        unitAccesses: { select: { unitId: true } },
      },
    }),
    prisma.unit.findFirst({
      where: { id: parsed.unitId, facilityId: session.facilityId },
      select: { id: true, unitType: true },
    }),
  ]);
  if (!employee || !unit) {
    throw new Error("Employee or unit not found.");
  }
  const allowedUnitIds = employee.unitAccesses.length > 0 ? new Set(employee.unitAccesses.map((access) => access.unitId)) : null;
  const eligible = isEmployeeEligibleForUnit({
    unitId: unit.id,
    unitType: unit.unitType,
    allowedUnitIds,
    workStations: employee.workStations.map((station) => station.station),
  });
  if (!eligible) {
    throw new Error("Employee is not eligible for this location.");
  }

  const scheduleDate = parseDate(parsed.date);
  const scheduleDateEnd = new Date(scheduleDate);
  scheduleDateEnd.setDate(scheduleDateEnd.getDate() + 1);
  const serveryMealShifts = new Set<ShiftType>([ShiftType.BREAKFAST, ShiftType.LUNCH, ShiftType.DINNER]);
  if (unit.unitType === "SERVERY" && serveryMealShifts.has(parsed.shift)) {
    await prisma.scheduleEntry.deleteMany({
      where: {
        unitId: unit.id,
        date: { gte: scheduleDate, lt: scheduleDateEnd },
        shift: parsed.shift,
      },
    });
  }

  await prisma.scheduleEntry.create({
    data: {
      employeeId: parsed.employeeId,
      unitId: parsed.unitId,
      date: scheduleDate,
      shift: parsed.shift,
      roleType: parsed.roleType ?? employee.roleType,
      plannedStart: parsed.plannedStart,
      plannedEnd: parsed.plannedEnd,
      createdById: session.authKind === "user" ? session.uid : undefined,
    },
  });

  revalidateStaffingViews();
}

export async function createOverrideAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");

  const parsed = createOverrideSchema.parse({
    scheduleEntryId: toOptional(formData.get("scheduleEntryId")),
    employeeId: formData.get("employeeId"),
    oldUnitId: toOptional(formData.get("oldUnitId")),
    newUnitId: formData.get("newUnitId"),
    date: formData.get("date"),
    mealType: toOptional(formData.get("mealType")),
    reason: formData.get("reason"),
  });

  const employee = await prisma.employee.findFirst({
    where: { id: parsed.employeeId, facilityId: session.facilityId },
    select: { id: true },
  });
  if (!employee) {
    throw new Error("Employee not found.");
  }
  const newUnit = await prisma.unit.findFirst({
    where: { id: parsed.newUnitId, facilityId: session.facilityId },
    select: { id: true },
  });
  if (!newUnit) {
    throw new Error("Unit not found.");
  }
  if (parsed.oldUnitId) {
    const oldUnit = await prisma.unit.findFirst({
      where: { id: parsed.oldUnitId, facilityId: session.facilityId },
      select: { id: true },
    });
    if (!oldUnit) {
      throw new Error("Old unit not found.");
    }
  }
  if (parsed.scheduleEntryId) {
    const entry = await prisma.scheduleEntry.findFirst({
      where: { id: parsed.scheduleEntryId, employeeId: parsed.employeeId },
      include: { employee: { select: { facilityId: true } } },
    });
    if (!entry || entry.employee.facilityId !== session.facilityId) {
      throw new Error("Schedule entry not found.");
    }
  }

  await prisma.assignmentOverride.create({
    data: {
      scheduleEntryId: parsed.scheduleEntryId,
      employeeId: parsed.employeeId,
      oldUnitId: parsed.oldUnitId,
      newUnitId: parsed.newUnitId,
      date: parseDate(parsed.date),
      mealType: parsed.mealType,
      reason: parsed.reason,
      changedById: session.authKind === "user" ? session.uid : undefined,
    },
  });

  revalidateStaffingViews();
}
