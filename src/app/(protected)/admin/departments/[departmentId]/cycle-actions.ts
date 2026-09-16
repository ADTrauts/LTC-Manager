"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireFacilitySession } from "@/lib/facility-context";
import {
  createDraft,
  deleteDraft,
  discardAllDrafts,
  duplicateCycle,
  formatServiceDateLong,
  generateDietaryDefaultsDrafts,
  generateEvsDefaultsDrafts,
  nextOperationalDayKey,
  publishCycle,
  reorderDrafts,
  applyDraftTreeMove,
  retireCycle,
  scheduleDraftPublications,
  updateDraft,
  type CycleActor,
} from "@/lib/operational-cycles";
import {
  locationModeFromUserScope,
  parseServiceStartTimesField,
  type CycleUserScope,
} from "@/lib/operational-cycles/cycle-scope";
import {
  getFacilityServiceDate,
  loadFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";
import { prisma } from "@/lib/prisma";

export type CycleActionResult =
  | { ok: true; message?: string; cycleId?: string }
  | { ok: false; message: string; errors?: string[] };

const cycleTypeSchema = z.enum([
  "PREPARATION",
  "SERVICE",
  "TRANSITION",
  "CLOSEOUT",
  "CUSTOM",
]);

const mealTypeSchema = z.enum(["BREAKFAST", "LUNCH", "DINNER"]);

const locationModeSchema = z.enum([
  "ALL_DEPARTMENT_UNITS",
  "UNIT_TYPES",
  "EXPLICIT_UNITS",
  "ROOM_TYPE",
]);

const milestoneSchema = z.enum(["READY", "SERVICE_STARTED"]);

const unitTypeSchema = z.enum([
  "SERVERY",
  "KITCHEN",
  "RETAIL",
  "OFFICE",
  "STORAGE",
  "OTHER",
  "RESIDENT_AREA",
  "COMMON_AREA",
  "MECHANICAL",
  "RESTROOM_CLUSTER",
  "EVS_ZONE",
  "GROUND",
]);

function actorFromSession(session: {
  uid: string;
  name?: string | null;
}): CycleActor {
  return {
    userId: session.uid,
    label: session.name ?? null,
  };
}

async function requireCyclesFeature(departmentId: string): Promise<void> {
  // Build authoring/schedule authority is enforced in cycle-service via resolveCycleAuthority.
  // Runtime rollout flags must not block Draft/Publish safety in Department Builder.
  void departmentId;
}

function revalidateCycles(departmentId: string) {
  revalidatePath(`/admin/departments/${departmentId}`);
  revalidatePath(`/admin/departments/${departmentId}`, "page");
  revalidatePath("/staffing/cycles");
  revalidatePath("/dashboard");
}

async function assertDepartmentInFacility(
  departmentId: string,
  facilityId: string,
): Promise<{ id: string }> {
  const department = await prisma.department.findFirst({
    where: { id: departmentId, facilityId, isActive: true },
    select: { id: true },
  });
  if (!department) throw new Error("Department not found.");
  return department;
}

function parseDaysOfWeek(raw: FormDataEntryValue | null): number[] {
  if (typeof raw !== "string" || !raw.trim()) {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  return raw
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

function parseCsvEnums<T extends string>(
  raw: FormDataEntryValue | null,
  allowed: readonly T[],
): T[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  const set = new Set(allowed);
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is T => set.has(part as T));
}

function parseLocationMode(formData: FormData) {
  const appliesTo = String(formData.get("appliesTo") ?? "").trim();
  if (appliesTo === "department" || appliesTo === "room_type" || appliesTo === "specific") {
    return locationModeFromUserScope(appliesTo as CycleUserScope);
  }
  return locationModeSchema.parse(
    String(formData.get("locationMode") ?? "ALL_DEPARTMENT_UNITS"),
  );
}

function parseIdList(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function parseKeyTimeGroups(raw: FormDataEntryValue | null): Array<{ dueLocal: string; spaceIds: string[] }> {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const dueLocal = String((item as { dueLocal?: string }).dueLocal ?? "").trim();
        const spaceIds = Array.isArray((item as { spaceIds?: unknown }).spaceIds)
          ? (item as { spaceIds: unknown[] }).spaceIds.map((id) => String(id).trim()).filter(Boolean)
          : [];
        if (!dueLocal) return null;
        return { dueLocal, spaceIds };
      })
      .filter((item): item is { dueLocal: string; spaceIds: string[] } => Boolean(item));
  } catch {
    return [];
  }
}

function parseDraftFromForm(formData: FormData) {
  const mealRaw = String(formData.get("mealType") ?? "").trim();
  const nodeKind = z.enum(["PERIOD", "KEY_TIME"]).parse(
    String(formData.get("nodeKind") ?? "PERIOD"),
  );
  const locationInheritFromParent = String(formData.get("locationInheritFromParent") ?? "") === "true";
  const locationMode = parseLocationMode(formData);
  const displaySequenceRaw = String(formData.get("displaySequence") ?? "").trim();

  const parseOptionalTime = (raw: FormDataEntryValue | null): string | null => {
    const value = String(raw ?? "").trim();
    if (!value) return null;
    const normalized = value.replace(/^(\d{1,2}:\d{2})(:\d{2})?$/, "$1");
    return z.string().regex(/^\d{1,2}:\d{2}$/).parse(normalized);
  };

  return {
    label: z.string().min(1).max(120).parse(String(formData.get("label") ?? "").trim()),
    description: (() => {
      const value = String(formData.get("description") ?? "").trim();
      return value || null;
    })(),
    cycleType: cycleTypeSchema.parse(String(formData.get("cycleType") ?? "")),
    nodeKind,
    displaySequence: displaySequenceRaw
      ? z.coerce.number().int().min(0).max(10_000).parse(displaySequenceRaw)
      : undefined,
    startLocal: nodeKind === "KEY_TIME" ? null : parseOptionalTime(formData.get("startLocal")),
    endLocal: nodeKind === "KEY_TIME" ? null : parseOptionalTime(formData.get("endLocal")),
    overnight: String(formData.get("overnight") ?? "") === "true",
    applicableDaysOfWeek: parseDaysOfWeek(formData.get("applicableDaysOfWeek")),
    effectiveFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .parse(String(formData.get("effectiveFrom") ?? "").trim()),
    effectiveTo: (() => {
      const value = String(formData.get("effectiveTo") ?? "").trim();
      if (!value) return null;
      return z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(value);
    })(),
    mealType: mealRaw ? mealTypeSchema.parse(mealRaw) : null,
    parentStableKey: (() => {
      const raw = String(formData.get("parentStableKey") ?? "").trim();
      return raw || null;
    })(),
    locationMode: locationInheritFromParent ? "EXPLICIT_UNITS" : locationMode,
    locationInheritFromParent,
    applicableUnitTypes:
      locationMode === "UNIT_TYPES"
        ? parseCsvEnums(
            formData.get("applicableUnitTypes"),
            unitTypeSchema.options as unknown as readonly z.infer<typeof unitTypeSchema>[],
          )
        : [],
    unitIds:
      locationMode === "EXPLICIT_UNITS" && !locationInheritFromParent
        ? parseIdList(formData.get("unitIds"))
        : [],
    spaceIds:
      locationMode === "EXPLICIT_UNITS" && !locationInheritFromParent
        ? parseIdList(formData.get("spaceIds"))
        : [],
    keyTimeGroups: nodeKind === "KEY_TIME" ? parseKeyTimeGroups(formData.get("keyTimeGroups")) : [],
    roomTypeKey:
      locationMode === "ROOM_TYPE"
        ? String(formData.get("roomTypeKey") ?? "").trim() || null
        : null,
    expectedMilestones: parseCsvEnums(
      formData.get("expectedMilestones"),
      milestoneSchema.options as unknown as readonly z.infer<typeof milestoneSchema>[],
    ),
    milestoneTimes: parseServiceStartTimesField(
      String(formData.get("serviceStartTimes") ?? ""),
    ),
  };
}

function toErrors(error: unknown): CycleActionResult {
  if (error instanceof z.ZodError) {
    return {
      ok: false,
      message: "Validation failed.",
      errors: error.issues.map((issue) => issue.message),
    };
  }
  const message = error instanceof Error ? error.message : "Operational Cycle action failed.";
  const errors = message
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    ok: false,
    message: errors[0] ?? message,
    errors: errors.length > 1 ? errors.slice(1) : undefined,
  };
}

export async function createCycleDraftAction(formData: FormData): Promise<CycleActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    await requireCyclesFeature(departmentId);
    await assertDepartmentInFacility(departmentId, session.facilityId);
    const draft = parseDraftFromForm(formData);
    const created = await createDraft(session, {
      facilityId: session.facilityId,
      departmentId,
      draft,
      actor: actorFromSession(session),
    });
    revalidateCycles(departmentId);
    return { ok: true, message: `Draft “${created.label}” created.`, cycleId: created.id };
  } catch (error) {
    return toErrors(error);
  }
}

export async function updateCycleDraftAction(formData: FormData): Promise<CycleActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    await requireCyclesFeature(departmentId);
    const cycleId = z.string().cuid().parse(formData.get("cycleId"));
    await assertDepartmentInFacility(departmentId, session.facilityId);
    const draft = parseDraftFromForm(formData);
    const updated = await updateDraft(session, {
      facilityId: session.facilityId,
      departmentId,
      cycleId,
      draft,
      actor: actorFromSession(session),
    });
    revalidateCycles(departmentId);
    return { ok: true, message: `Draft “${updated.label}” updated.`, cycleId: updated.id };
  } catch (error) {
    return toErrors(error);
  }
}

export async function duplicateCycleAction(formData: FormData): Promise<CycleActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    await requireCyclesFeature(departmentId);
    const cycleId = z.string().cuid().parse(formData.get("cycleId"));
    await assertDepartmentInFacility(departmentId, session.facilityId);
    const created = await duplicateCycle(session, {
      facilityId: session.facilityId,
      departmentId,
      cycleId,
      actor: actorFromSession(session),
    });
    revalidateCycles(departmentId);
    return {
      ok: true,
      message: `Duplicated as draft v${created.version}.`,
      cycleId: created.id,
    };
  } catch (error) {
    return toErrors(error);
  }
}

export async function reorderCycleDraftsAction(formData: FormData): Promise<CycleActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    await requireCyclesFeature(departmentId);
    await assertDepartmentInFacility(departmentId, session.facilityId);
    const orderedCycleIds = String(formData.get("orderedCycleIds") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (orderedCycleIds.length === 0) {
      throw new Error("Provide draft cycle ids to reorder.");
    }
    for (const id of orderedCycleIds) {
      z.string().cuid().parse(id);
    }
    await reorderDrafts(session, {
      facilityId: session.facilityId,
      departmentId,
      orderedCycleIds,
      actor: actorFromSession(session),
    });
    revalidateCycles(departmentId);
    return { ok: true, message: "Draft order updated." };
  } catch (error) {
    return toErrors(error);
  }
}

export async function moveCycleTreeAction(formData: FormData): Promise<CycleActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    await requireCyclesFeature(departmentId);
    await assertDepartmentInFacility(departmentId, session.facilityId);
    const activeId = z.string().cuid().parse(formData.get("activeId"));
    const overId = z.string().cuid().parse(formData.get("overId"));
    const placement = z.enum(["before", "after", "inside"]).parse(
      String(formData.get("placement") ?? "after"),
    );
    const result = await applyDraftTreeMove(session, {
      facilityId: session.facilityId,
      departmentId,
      activeId,
      overId,
      placement,
      actor: actorFromSession(session),
    });
    revalidateCycles(departmentId);
    return { ok: true, message: result.summary };
  } catch (error) {
    return toErrors(error);
  }
}

export async function publishCycleAction(formData: FormData): Promise<CycleActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    await requireCyclesFeature(departmentId);
    const cycleId = z.string().cuid().parse(formData.get("cycleId"));
    await assertDepartmentInFacility(departmentId, session.facilityId);
    const published = await publishCycle(session, {
      facilityId: session.facilityId,
      departmentId,
      cycleId,
      actor: actorFromSession(session),
    });
    revalidateCycles(departmentId);
    return {
      ok: true,
      message: `Scheduled “${published.label}” (effective ${String(formData.get("effectiveFrom") ?? "").trim() || "per draft date"}).`,
      cycleId: published.id,
    };
  } catch (error) {
    return toErrors(error);
  }
}

/** Schedules every latest draft. Publish validation loads Key Time groups in cycle-service. */
export async function scheduleCycleChangesAction(formData: FormData): Promise<CycleActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    await requireCyclesFeature(departmentId);
    await assertDepartmentInFacility(departmentId, session.facilityId);

    const mode = z.enum(["next_operational_day", "immediate", "choose_date"]).parse(
      String(formData.get("activationMode") ?? "next_operational_day"),
    );
    const timezone = await loadFacilityTimezone(prisma, session.facilityId);
    const todayKey = toServiceDateKey(getFacilityServiceDate(timezone, new Date()));
    const nextDay = nextOperationalDayKey(todayKey);

    let effectiveFrom = nextDay;
    let allowImmediate = false;
    if (mode === "immediate") {
      if (process.env.NODE_ENV === "production") {
        return {
          ok: false,
          message: "Immediate publish is only available in development/test environments.",
        };
      }
      if (String(formData.get("confirmImmediate") ?? "") !== "1") {
        return {
          ok: false,
          message: "Confirm that today’s Run should switch immediately before publishing today.",
        };
      }
      effectiveFrom = todayKey;
      allowImmediate = true;
    } else if (mode === "choose_date") {
      effectiveFrom = z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .parse(String(formData.get("effectiveFrom") ?? "").trim());
      // Choosing today's date explicitly is same-day activation.
      if (effectiveFrom === todayKey) {
        allowImmediate = true;
      }
    }

    const result = await scheduleDraftPublications(session, {
      facilityId: session.facilityId,
      departmentId,
      effectiveFrom,
      allowImmediate,
      actor: actorFromSession(session),
    });
    revalidateCycles(departmentId);
    if (result.publishedIds.length === 0) {
      return { ok: true, message: "No draft changes to publish." };
    }
    return {
      ok: true,
      message:
        allowImmediate && effectiveFrom === todayKey
          ? `Published ${result.publishedIds.length} cycle change(s) effective today (${formatServiceDateLong(result.effectiveFrom)}). Run is using this configuration now.`
          : `Scheduled ${result.publishedIds.length} cycle change(s) effective ${formatServiceDateLong(result.effectiveFrom)}.`,
    };
  } catch (error) {
    return toErrors(error);
  }
}

export async function deleteCycleDraftAction(formData: FormData): Promise<CycleActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    await requireCyclesFeature(departmentId);
    const cycleId = z.string().cuid().parse(formData.get("cycleId"));
    await assertDepartmentInFacility(departmentId, session.facilityId);
    const deleted = await deleteDraft(session, {
      facilityId: session.facilityId,
      departmentId,
      cycleId,
      actor: actorFromSession(session),
    });
    revalidateCycles(departmentId);
    const extra =
      deleted.deletedCount > 1
        ? ` Removed ${deleted.deletedCount} draft items including nested phases and key times.`
        : "";
    return {
      ok: true,
      message: `Deleted “${deleted.label}”.${extra}`,
      cycleId: deleted.id,
    };
  } catch (error) {
    return toErrors(error);
  }
}

export async function discardAllCycleDraftsAction(formData: FormData): Promise<CycleActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    await requireCyclesFeature(departmentId);
    await assertDepartmentInFacility(departmentId, session.facilityId);
    const result = await discardAllDrafts(session, {
      facilityId: session.facilityId,
      departmentId,
      actor: actorFromSession(session),
    });
    revalidateCycles(departmentId);
    return {
      ok: true,
      message:
        result.deletedCount === 0
          ? "No draft changes to discard."
          : `Discarded ${result.deletedCount} draft change${result.deletedCount === 1 ? "" : "s"}. Current configuration is unchanged.`,
    };
  } catch (error) {
    return toErrors(error);
  }
}

export async function retireCycleAction(formData: FormData): Promise<CycleActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    await requireCyclesFeature(departmentId);
    const cycleId = z.string().cuid().parse(formData.get("cycleId"));
    await assertDepartmentInFacility(departmentId, session.facilityId);
    const retired = await retireCycle(session, {
      facilityId: session.facilityId,
      departmentId,
      cycleId,
      actor: actorFromSession(session),
    });
    revalidateCycles(departmentId);
    return { ok: true, message: `Retired “${retired.label}”.`, cycleId: retired.id };
  } catch (error) {
    return toErrors(error);
  }
}

export async function generateDietaryDefaultsAction(
  formData: FormData,
): Promise<CycleActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    await requireCyclesFeature(departmentId);
    await assertDepartmentInFacility(departmentId, session.facilityId);
    const effectiveFrom = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .parse(String(formData.get("effectiveFrom") ?? "").trim());
    const created = await generateDietaryDefaultsDrafts(session, {
      facilityId: session.facilityId,
      departmentId,
      effectiveFrom,
      actor: actorFromSession(session),
    });
    revalidateCycles(departmentId);
    return {
      ok: true,
      message:
        created.length === 0
          ? "Dietary starter cycles already exist for this department."
          : `Added Dietary starter (${created.length} draft cycles) for review.`,
    };
  } catch (error) {
    return toErrors(error);
  }
}

export async function generateEvsDefaultsAction(
  formData: FormData,
): Promise<CycleActionResult> {
  try {
    const session = await requireFacilitySession();
    const departmentId = z.string().cuid().parse(formData.get("departmentId"));
    await requireCyclesFeature(departmentId);
    await assertDepartmentInFacility(departmentId, session.facilityId);
    const effectiveFrom = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .parse(String(formData.get("effectiveFrom") ?? "").trim());
    const created = await generateEvsDefaultsDrafts(session, {
      facilityId: session.facilityId,
      departmentId,
      effectiveFrom,
      actor: actorFromSession(session),
    });
    revalidateCycles(departmentId);
    return {
      ok: true,
      message:
        created.length === 0
          ? "All EVS defaults already exist as drafts or published cycles."
          : `Added ${created.length} EVS default draft(s) for review.`,
    };
  } catch (error) {
    return toErrors(error);
  }
}

