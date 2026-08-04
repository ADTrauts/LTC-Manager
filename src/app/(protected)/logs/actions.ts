"use server";

import { revalidatePath } from "next/cache";
import {
  LogFieldType,
  LogRecurrence,
  LogSubmissionStatus,
  MealType,
  RoleKey,
} from "@prisma/client";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { requireFacilitySession } from "@/lib/facility-context";
import { prisma } from "@/lib/prisma";
import { syncLogSubmissionRecordToTask } from "@/lib/work/adapters/log-task";

const LOG_FIELD_TYPES = [
  LogFieldType.YES_NO,
  LogFieldType.NUMBER,
  LogFieldType.TEMPERATURE,
  LogFieldType.DROPDOWN,
  LogFieldType.SHORT_TEXT,
  LogFieldType.LONG_TEXT,
  LogFieldType.PASS_FAIL,
] as const;

const LOG_RECURRENCES = [
  LogRecurrence.DAILY,
  LogRecurrence.PER_MEAL,
  LogRecurrence.WEEKLY,
  LogRecurrence.CUSTOM,
] as const;

const ROLE_KEYS = [
  RoleKey.FACILITY_ADMINISTRATOR,
  RoleKey.GM,
  RoleKey.MANAGER,
  RoleKey.SUPERVISOR,
  RoleKey.LEAD_TEAM_MEMBER,
  RoleKey.STAFF,
] as const;

const createTemplateSchema = z.object({
  name: z.string().trim().min(3).max(140),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  instructions: z.string().trim().max(1000).optional(),
  recurrence: z.enum(LOG_RECURRENCES),
  isActive: z.coerce.boolean().default(true),
});

const addFieldSchema = z.object({
  templateId: z.string().cuid(),
  label: z.string().trim().min(2).max(120),
  fieldType: z.enum(LOG_FIELD_TYPES),
  isRequired: z.coerce.boolean().default(true),
  unitLabel: z.string().trim().max(20).optional(),
  fieldOptions: z.string().trim().optional(),
});

const createAssignmentSchema = z.object({
  unitId: z.string().cuid(),
  templateId: z.string().cuid(),
  recurrence: z.enum(LOG_RECURRENCES),
  mealType: z.nativeEnum(MealType).optional(),
  timesPerDay: z.coerce.number().int().min(1).max(10),
  requiredRole: z.enum(ROLE_KEYS).optional(),
  isActive: z.coerce.boolean().default(true),
});

const toggleAssignmentSchema = z.object({
  assignmentId: z.string().cuid(),
  isActive: z.coerce.boolean(),
});

const submitLogSchema = z.object({
  assignmentId: z.string().cuid(),
  serviceDate: z.string().trim().min(8),
  mealType: z.nativeEnum(MealType).optional(),
  status: z.nativeEnum(LogSubmissionStatus),
  notes: z.string().trim().max(1000).optional(),
  correctiveAction: z.string().trim().max(1000).optional(),
});

function toOptional(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function revalidateLogPaths() {
  revalidatePath("/logs");
  revalidatePath("/dashboard");
  revalidatePath("/units");
  revalidatePath("/unit/[unitId]", "page");
}

export async function createLogTemplateAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const role = await prisma.role.findUnique({
    where: { key: session.role },
    select: { id: true },
  });

  const parsed = createTemplateSchema.parse({
    name: formData.get("name"),
    category: formData.get("category"),
    description: toOptional(formData.get("description")),
    instructions: toOptional(formData.get("instructions")),
    recurrence: formData.get("recurrence"),
    isActive: formData.get("isActive") === "on",
  });

  await prisma.logTemplate.create({
    data: {
      facilityId: session.facilityId,
      name: parsed.name,
      category: parsed.category,
      description: parsed.description,
      instructions: parsed.instructions,
      recurrence: parsed.recurrence,
      isActive: parsed.isActive,
      createdByRoleId: role?.id,
    },
  });

  revalidateLogPaths();
}

export async function addTemplateFieldAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = addFieldSchema.parse({
    templateId: formData.get("templateId"),
    label: formData.get("label"),
    fieldType: formData.get("fieldType"),
    isRequired: formData.get("isRequired") === "on",
    unitLabel: toOptional(formData.get("unitLabel")),
    fieldOptions: toOptional(formData.get("fieldOptions")),
  });

  const template = await prisma.logTemplate.findFirst({
    where: { id: parsed.templateId, facilityId: session.facilityId },
    select: { id: true },
  });
  if (!template) {
    throw new Error("Template not found.");
  }

  const maxOrder = await prisma.logTemplateField.aggregate({
    where: { templateId: parsed.templateId },
    _max: { fieldOrder: true },
  });

  const options =
    parsed.fieldType === LogFieldType.DROPDOWN
      ? (parsed.fieldOptions ?? "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

  await prisma.logTemplateField.create({
    data: {
      templateId: parsed.templateId,
      label: parsed.label,
      fieldType: parsed.fieldType,
      isRequired: parsed.isRequired,
      unitLabel: parsed.unitLabel,
      fieldOptions: options,
      fieldOrder: (maxOrder._max.fieldOrder ?? 0) + 1,
    },
  });

  revalidateLogPaths();
}

export async function createLogAssignmentAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = createAssignmentSchema.parse({
    unitId: formData.get("unitId"),
    templateId: formData.get("templateId"),
    recurrence: formData.get("recurrence"),
    mealType: toOptional(formData.get("mealType")),
    timesPerDay: formData.get("timesPerDay"),
    requiredRole: toOptional(formData.get("requiredRole")),
    isActive: formData.get("isActive") === "on",
  });

  const [unit, template] = await Promise.all([
    prisma.unit.findFirst({
      where: { id: parsed.unitId, facilityId: session.facilityId },
      select: { id: true },
    }),
    prisma.logTemplate.findFirst({
      where: { id: parsed.templateId, facilityId: session.facilityId },
      select: { id: true },
    }),
  ]);
  if (!unit || !template) {
    throw new Error("Unit or template not found.");
  }

  await prisma.logAssignment.create({
    data: {
      unitId: parsed.unitId,
      templateId: parsed.templateId,
      recurrence: parsed.recurrence,
      mealType: parsed.mealType,
      timesPerDay: parsed.timesPerDay,
      requiredRole: parsed.requiredRole,
      isActive: parsed.isActive,
    },
  });

  revalidateLogPaths();
}

export async function toggleLogAssignmentAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "MANAGER");

  const parsed = toggleAssignmentSchema.parse({
    assignmentId: formData.get("assignmentId"),
    isActive: formData.get("isActive") === "true",
  });

  const assignment = await prisma.logAssignment.findFirst({
    where: { id: parsed.assignmentId, unit: { facilityId: session.facilityId } },
    select: { id: true },
  });
  if (!assignment) {
    throw new Error("Assignment not found.");
  }

  await prisma.logAssignment.update({
    where: { id: parsed.assignmentId },
    data: { isActive: parsed.isActive },
  });

  revalidateLogPaths();
}

export async function submitLogAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "STAFF");

  const parsed = submitLogSchema.parse({
    assignmentId: formData.get("assignmentId"),
    serviceDate: formData.get("serviceDate"),
    mealType: toOptional(formData.get("mealType")),
    status: formData.get("status"),
    notes: toOptional(formData.get("notes")),
    correctiveAction: toOptional(formData.get("correctiveAction")),
  });

  const assignment = await prisma.logAssignment.findFirst({
    where: {
      id: parsed.assignmentId,
      isActive: true,
      unit: { facilityId: session.facilityId },
    },
    include: {
      template: {
        include: {
          fields: {
            orderBy: { fieldOrder: "asc" },
          },
        },
      },
    },
  });

  if (!assignment) {
    throw new Error("Assignment is not active or not found.");
  }

  const values = assignment.template.fields.map((field) => {
    const raw = formData.get(`field_${field.id}`);
    const rawString = typeof raw === "string" ? raw.trim() : "";

    if (field.isRequired && rawString.length === 0) {
      throw new Error(`Field "${field.label}" is required.`);
    }

    const base = {
      fieldId: field.id,
      valueText: null as string | null,
      valueNumber: null as number | null,
      valueBoolean: null as boolean | null,
      valueDateTime: null as Date | null,
    };

    if (!rawString) {
      return base;
    }

    if (field.fieldType === LogFieldType.NUMBER || field.fieldType === LogFieldType.TEMPERATURE) {
      const parsedNumber = Number(rawString);
      if (Number.isNaN(parsedNumber)) {
        throw new Error(`Field "${field.label}" must be a number.`);
      }
      return { ...base, valueNumber: parsedNumber };
    }

    if (field.fieldType === LogFieldType.YES_NO || field.fieldType === LogFieldType.PASS_FAIL) {
      return { ...base, valueBoolean: rawString === "true" };
    }

    return { ...base, valueText: rawString };
  });

  const serviceDate = new Date(parsed.serviceDate);
  if (Number.isNaN(serviceDate.getTime())) {
    throw new Error("Invalid service date.");
  }

  const submittedById = session.authKind === "user" ? session.uid : undefined;
  const submittedByEmployeeId = session.authKind === "employee" ? session.uid : undefined;

  const submission = await prisma.logSubmission.create({
    data: {
      assignmentId: assignment.id,
      unitId: assignment.unitId,
      templateId: assignment.templateId,
      serviceDate,
      mealType: parsed.mealType,
      submittedById,
      submittedByEmployeeId,
      status: parsed.status,
      notes: parsed.notes,
      correctiveAction: parsed.correctiveAction,
      values: {
        createMany: {
          data: values,
        },
      },
    },
    select: {
      id: true,
      status: true,
      notes: true,
      submittedAt: true,
      unitId: true,
      mealType: true,
      submittedByEmployeeId: true,
      unit: { select: { facilityId: true } },
      template: { select: { name: true, departmentId: true } },
    },
  });

  // Additive Work Engine projection — guarded; never fails the log submit.
  await syncLogSubmissionRecordToTask({
    id: submission.id,
    status: submission.status,
    notes: submission.notes,
    submittedAt: submission.submittedAt,
    unitId: submission.unitId,
    mealType: submission.mealType,
    submittedByEmployeeId: submission.submittedByEmployeeId,
    facilityId: submission.unit.facilityId,
    departmentId: submission.template.departmentId,
    templateName: submission.template.name,
  });

  revalidateLogPaths();
}
