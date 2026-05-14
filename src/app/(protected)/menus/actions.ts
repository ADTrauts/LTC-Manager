"use server";

import { revalidatePath } from "next/cache";
import { MenuItemEntryType, MenuWeekStartDay, Prisma } from "@prisma/client";
import { z } from "zod";

import { requireAtLeastRole } from "@/lib/access";
import { requireFacilitySession } from "@/lib/facility-context";
import { assertPrismaMenuReady, isMenuInfrastructureUnavailableError } from "@/lib/menu-db";
import { prisma } from "@/lib/prisma";

const menuSettingsSchema = z.object({
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
  weekNumber: z.coerce.number().int().min(1).max(4),
  dayIndex: z.coerce.number().int().min(0).max(6),
  mealPeriodKey: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(80),
  itemsJson: z.string().trim().min(2),
});

type PeriodPayload = {
  key: string;
  label: string;
  categories: string[];
};

function revalidateMenuLinkedPages() {
  revalidatePath("/menus");
  revalidatePath("/logs");
  revalidatePath("/dashboard");
  revalidatePath("/unit/[unitId]", "page");
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
    const raw = row as { key?: unknown; label?: unknown; categories?: unknown };
    const key = typeof raw.key === "string" ? raw.key.trim().toUpperCase() : "";
    const label = typeof raw.label === "string" ? raw.label.trim() : "";
    const normalizedLabel = label.toLowerCase();
    if (!key || !label || seenKeys.has(key) || seenLabels.has(normalizedLabel)) continue;
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
    cleaned.push({ key, label, categories });
  }
  if (cleaned.length === 0) {
    throw new Error("Add at least one meal period with one category.");
  }
  return cleaned as Prisma.InputJsonValue;
}

export async function saveMenuSettingsAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");

  const parsed = menuSettingsSchema.parse({
    cycleLengthWeeks: formData.get("cycleLengthWeeks"),
    weekStartsOn: formData.get("weekStartsOn"),
    cycleAnchorDate: formData.get("cycleAnchorDate"),
    periodConfigJson: formData.get("periodConfigJson"),
  });

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
    await prisma.menuSettings.upsert({
      where: { facilityId: session.facilityId },
      create: {
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
  } catch (error) {
    if (isMenuInfrastructureUnavailableError(error)) {
      throw new Error(
        "Menu tables are not in this database yet. Apply the menu migration when your workflow allows (no database reset required).",
      );
    }
    throw error;
  }

  revalidateMenuLinkedPages();
}

export async function saveMenuCategoryItemsAction(formData: FormData) {
  const session = await requireFacilitySession();
  requireAtLeastRole(session.role, "SUPERVISOR");

  const parsed = saveCategorySchema.parse({
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

  assertPrismaMenuReady(prisma);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.menuItem.deleteMany({
        where: {
          facilityId: session.facilityId,
          weekNumber: parsed.weekNumber,
          dayIndex: parsed.dayIndex,
          mealPeriodKey: parsed.mealPeriodKey,
          category: parsed.category,
        },
      });

      if (rows.length > 0) {
        await tx.menuItem.createMany({
          data: rows.map((row, index) => ({
            facilityId: session.facilityId,
            weekNumber: parsed.weekNumber,
            dayIndex: parsed.dayIndex,
            mealPeriodKey: parsed.mealPeriodKey,
            category: parsed.category,
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
    if (isMenuInfrastructureUnavailableError(error)) {
      throw new Error(
        "Menu tables are not in this database yet. Apply the menu migration when your workflow allows (no database reset required).",
      );
    }
    throw error;
  }

  revalidateMenuLinkedPages();
}

