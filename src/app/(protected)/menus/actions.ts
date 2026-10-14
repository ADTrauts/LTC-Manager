"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MenuItemEntryType, MenuStatus, MenuWeekStartDay, Prisma } from "@prisma/client";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { requireFacilitySession } from "@/lib/facility-context";
import {
  isMenuStatus,
  menuItemSlotWhere,
  normalizeMenuName,
  requireAuthorizedMenu,
  requireAuthorizedMenuDepartment,
} from "@/lib/menu-authority";
import {
  loadDepartmentMenuLocations,
  loadEligibleMenuOperationalCycles,
  loadMenuApplicability,
  replaceMenuApplicability,
} from "@/lib/menu-applicability-db";
import {
  cycleAssignmentsFromPeriods,
  normalizeMenuLocationTarget,
  resolveMenuPeriodKeys,
} from "@/lib/menu-applicability";
import { storedMenuPeriodConfigs } from "@/lib/menu-cycle";
import { assertPrismaMenuReady, isMenuInfrastructureUnavailableError } from "@/lib/menu-db";
import { prisma } from "@/lib/prisma";

const menuIdentitySchema = z.object({
  name: z.string().trim().min(1).max(120),
  departmentId: z.string().trim().min(1),
});

const menuUpdateSchema = z.object({
  menuId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120),
  status: z.nativeEnum(MenuStatus),
});

const menuSettingsSchema = z.object({
  menuId: z.string().trim().min(1),
  cycleLengthWeeks: z.coerce.number().int().min(3).max(4),
  weekStartsOn: z.nativeEnum(MenuWeekStartDay),
  cycleAnchorDate: z.string().trim().min(8),
  periodConfigJson: z.string().trim().optional(),
});

const menuRowJsonSchema = z.object({
  itemName: z.string().trim().min(1).max(500),
  portionValue: z.string().trim().max(120).optional(),
  portionUnit: z.string().trim().max(120).optional(),
  entryType: z.nativeEnum(MenuItemEntryType),
});

const saveCategorySchema = z.object({
  menuId: z.string().trim().min(1),
  weekNumber: z.coerce.number().int().min(1).max(4),
  dayIndex: z.coerce.number().int().min(0).max(6),
  mealPeriodKey: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(80),
  itemsJson: z.string().trim().min(2),
});

const menuApplicabilitySchema = z.object({
  menuId: z.string().trim().min(1),
  locationsJson: z.string().trim().min(2),
  cyclesJson: z.string().trim().min(2),
});

const locationTargetSchema = z
  .object({
    unitId: z.string().trim().min(1).nullable().optional(),
    spaceId: z.string().trim().min(1).nullable().optional(),
  })
  .refine((row) => Boolean(row.unitId) !== Boolean(row.spaceId), {
    message: "A Menu location must be exactly one Unit or one Room.",
  });

const cycleAssignmentSchema = z.object({
  cycleStableKey: z.string().trim().min(1).max(80),
  menuPeriodKey: z.string().trim().min(1).max(80),
});

type PeriodPayload = {
  key: string;
  label: string;
  categories: string[];
  cycleStableKey: string | null;
};

function revalidateMenuPages(menuId?: string) {
  revalidatePath("/menus");
  if (menuId) {
    revalidatePath(`/menus/${menuId}`);
    revalidatePath("/menus/[menuId]", "page");
  }
  revalidatePath("/logs");
}

function normalizePeriodPayload(value: unknown): Prisma.InputJsonValue {
  if (!Array.isArray(value)) {
    throw new Error("Menu periods payload must be an array.");
  }
  const seenKeys = new Set<string>();
  const seenLabels = new Set<string>();
  const cleaned: PeriodPayload[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const raw = row as {
      key?: unknown;
      label?: unknown;
      categories?: unknown;
      cycleStableKey?: unknown;
    };
    const key = typeof raw.key === "string" ? raw.key.trim().toUpperCase() : "";
    const label = typeof raw.label === "string" ? raw.label.trim() : "";
    const normalizedLabel = label.toLowerCase();
    if (!key || !label || seenKeys.has(key) || seenLabels.has(normalizedLabel)) continue;
    const cycleStableKey =
      typeof raw.cycleStableKey === "string" && raw.cycleStableKey.trim().length > 0
        ? raw.cycleStableKey.trim()
        : null;
    const categoriesRaw = Array.isArray(raw.categories)
      ? raw.categories.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
      : [];
    const seenCategories = new Set<string>();
    const categories = categoriesRaw.filter((category) => {
      const normalized = category.toLowerCase();
      if (seenCategories.has(normalized)) return false;
      seenCategories.add(normalized);
      return true;
    });
    if (categories.length === 0) continue;
    seenKeys.add(key);
    seenLabels.add(normalizedLabel);
    cleaned.push({ key, label, categories, cycleStableKey });
  }
  return cleaned as Prisma.InputJsonValue;
}

function infrastructureError(error: unknown): never {
  if (isMenuInfrastructureUnavailableError(error)) {
    throw new Error(
      "Menu tables are not in this database yet. Apply the menu migration when your workflow allows (no database reset required).",
    );
  }
  throw error;
}

export async function createMenuAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");

  const parsed = menuIdentitySchema.parse({
    name: formData.get("name"),
    departmentId: formData.get("departmentId"),
  });
  const name = normalizeMenuName(parsed.name);
  if (name.length === 0) {
    throw new Error("Menu name is required.");
  }

  const department = await requireAuthorizedMenuDepartment({
    session,
    departmentId: parsed.departmentId,
  });

  assertPrismaMenuReady(prisma);
  let menuId: string;
  try {
    const created = await prisma.$transaction(async (tx) => {
      const menu = await tx.menu.create({
        data: {
          facilityId: session.facilityId,
          departmentId: department.id,
          name,
          status: "ACTIVE",
        },
      });
      await tx.menuCycleSettings.create({
        data: {
          menuId: menu.id,
          facilityId: session.facilityId,
          cycleLengthWeeks: 3,
          weekStartsOn: "SUNDAY",
          cycleAnchorDate: new Date(new Date().toDateString()),
          periodConfigJson: [] as unknown as Prisma.InputJsonValue,
        },
      });
      return menu;
    });
    menuId = created.id;
  } catch (error) {
    infrastructureError(error);
  }

  revalidateMenuPages(menuId);
  redirect(`/menus/${menuId}?tab=menu`);
}

export async function updateMenuAction(formData: FormData) {
  const parsed = menuUpdateSchema.parse({
    menuId: formData.get("menuId"),
    name: formData.get("name"),
    status: formData.get("status"),
  });
  if (!isMenuStatus(parsed.status)) {
    throw new Error("Invalid menu status.");
  }
  const name = normalizeMenuName(parsed.name);
  if (name.length === 0) {
    throw new Error("Menu name is required.");
  }

  const { menu } = await requireAuthorizedMenu(parsed.menuId);
  assertPrismaMenuReady(prisma);
  try {
    await prisma.menu.update({
      where: { id: menu.id },
      data: { name, status: parsed.status },
    });
  } catch (error) {
    infrastructureError(error);
  }

  revalidateMenuPages(menu.id);
}

export async function saveMenuOverviewAction(formData: FormData) {
  await updateMenuAction(formData);
  await saveMenuSettingsAction(formData);
}

export async function saveMenuSettingsAction(formData: FormData) {
  const parsed = menuSettingsSchema.parse({
    menuId: formData.get("menuId"),
    cycleLengthWeeks: formData.get("cycleLengthWeeks"),
    weekStartsOn: formData.get("weekStartsOn"),
    cycleAnchorDate: formData.get("cycleAnchorDate"),
    periodConfigJson: formData.get("periodConfigJson"),
  });

  const { session, menu } = await requireAuthorizedMenu(parsed.menuId);

  const cycleAnchorDate = new Date(parsed.cycleAnchorDate);
  if (Number.isNaN(cycleAnchorDate.getTime())) {
    throw new Error("Invalid cycle anchor date.");
  }
  cycleAnchorDate.setHours(0, 0, 0, 0);

  let periodConfigJson: Prisma.InputJsonValue | undefined = undefined;
  if (parsed.periodConfigJson) {
    try {
      periodConfigJson = normalizePeriodPayload(JSON.parse(parsed.periodConfigJson));
    } catch {
      throw new Error("Invalid menu period configuration payload.");
    }
  }

  assertPrismaMenuReady(prisma);
  try {
    await prisma.menuCycleSettings.upsert({
      where: { menuId: menu.id },
      create: {
        menuId: menu.id,
        facilityId: session.facilityId,
        cycleLengthWeeks: parsed.cycleLengthWeeks,
        weekStartsOn: parsed.weekStartsOn,
        cycleAnchorDate,
        periodConfigJson,
      },
      update: {
        cycleLengthWeeks: parsed.cycleLengthWeeks,
        weekStartsOn: parsed.weekStartsOn,
        cycleAnchorDate,
        periodConfigJson,
      },
    });
    if (periodConfigJson !== undefined) {
      const [existing, departmentLocations, eligible] = await Promise.all([
        loadMenuApplicability(prisma, menu.id),
        loadDepartmentMenuLocations({
          facilityId: session.facilityId,
          departmentId: menu.departmentId,
        }),
        loadEligibleMenuOperationalCycles({
          facilityId: session.facilityId,
          departmentId: menu.departmentId,
        }),
      ]);
      if (!departmentLocations) {
        throw new Error("Department locations are not available for this Menu.");
      }
      await replaceMenuApplicability({
        menuId: menu.id,
        locations: existing.locations,
        cycles: cycleAssignmentsFromPeriods(storedMenuPeriodConfigs(periodConfigJson)),
        existing,
        actionable: departmentLocations.locations,
        eligible,
        periodKeys: resolveMenuPeriodKeys(periodConfigJson),
      });
    }
  } catch (error) {
    infrastructureError(error);
  }

  revalidateMenuPages(menu.id);
}

export async function saveMenuCategoryItemsAction(formData: FormData) {
  const parsed = saveCategorySchema.parse({
    menuId: formData.get("menuId"),
    weekNumber: formData.get("weekNumber"),
    dayIndex: formData.get("dayIndex"),
    mealPeriodKey: formData.get("mealPeriodKey"),
    category: formData.get("category"),
    itemsJson: typeof formData.get("itemsJson") === "string" ? formData.get("itemsJson") : "",
  });

  let rows: z.infer<typeof menuRowJsonSchema>[];
  try {
    const raw = JSON.parse(parsed.itemsJson);
    rows = z.array(menuRowJsonSchema).parse(raw);
  } catch {
    throw new Error("Invalid menu rows payload.");
  }

  const { session, menu } = await requireAuthorizedMenu(parsed.menuId);
  const slot = menuItemSlotWhere({
    menuId: menu.id,
    weekNumber: parsed.weekNumber,
    dayIndex: parsed.dayIndex,
    mealPeriodKey: parsed.mealPeriodKey,
    category: parsed.category,
  });

  assertPrismaMenuReady(prisma);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.menuItem.deleteMany({ where: slot });

      if (rows.length > 0) {
        await tx.menuItem.createMany({
          data: rows.map((row, index) => ({
            menuId: menu.id,
            facilityId: session.facilityId,
            weekNumber: slot.weekNumber,
            dayIndex: slot.dayIndex,
            mealPeriodKey: slot.mealPeriodKey,
            category: slot.category,
            itemName: row.itemName,
            portionValue:
              row.entryType === MenuItemEntryType.CHOICE_PLACEHOLDER
                ? null
                : row.portionValue && row.portionValue.length > 0
                  ? row.portionValue
                  : null,
            portionUnit:
              row.entryType === MenuItemEntryType.CHOICE_PLACEHOLDER
                ? null
                : row.portionUnit && row.portionUnit.length > 0
                  ? row.portionUnit
                  : null,
            entryType: row.entryType,
            displayOrder: index + 1,
          })),
        });
      }
    });
  } catch (error) {
    infrastructureError(error);
  }

  revalidateMenuPages(menu.id);
}

export async function saveMenuApplicabilityAction(formData: FormData) {
  const parsed = menuApplicabilitySchema.parse({
    menuId: formData.get("menuId"),
    locationsJson: typeof formData.get("locationsJson") === "string" ? formData.get("locationsJson") : "",
    cyclesJson: typeof formData.get("cyclesJson") === "string" ? formData.get("cyclesJson") : "",
  });

  let locations: z.infer<typeof locationTargetSchema>[];
  let cycles: z.infer<typeof cycleAssignmentSchema>[];
  try {
    locations = z.array(locationTargetSchema).parse(JSON.parse(parsed.locationsJson));
    cycles = z.array(cycleAssignmentSchema).parse(JSON.parse(parsed.cyclesJson));
  } catch {
    throw new Error("Invalid Menu applicability payload.");
  }

  const { session, menu } = await requireAuthorizedMenu(parsed.menuId);
  assertPrismaMenuReady(prisma);

  try {
    const [existing, departmentLocations, eligible, settings] = await Promise.all([
      loadMenuApplicability(prisma, menu.id),
      loadDepartmentMenuLocations({
        facilityId: session.facilityId,
        departmentId: menu.departmentId,
      }),
      loadEligibleMenuOperationalCycles({
        facilityId: session.facilityId,
        departmentId: menu.departmentId,
      }),
      prisma.menuCycleSettings.findFirst({
        where: { menuId: menu.id },
        select: { periodConfigJson: true },
      }),
    ]);
    if (!departmentLocations) {
      throw new Error("Department locations are not available for this Menu.");
    }

    await replaceMenuApplicability({
      menuId: menu.id,
      locations: locations.map((row) => normalizeMenuLocationTarget(row)),
      cycles,
      existing,
      actionable: departmentLocations.locations,
      eligible,
      periodKeys: resolveMenuPeriodKeys(settings?.periodConfigJson),
    });
  } catch (error) {
    infrastructureError(error);
  }

  revalidateMenuPages(menu.id);
}
