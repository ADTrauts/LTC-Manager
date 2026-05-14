import { Prisma } from "@prisma/client";
import type { MenuItem, MenuSettings, PrismaClient } from "@prisma/client";

export type MenuItemCycleRow = Pick<
  MenuItem,
  | "weekNumber"
  | "dayIndex"
  | "mealPeriodKey"
  | "category"
  | "itemName"
  | "portionValue"
  | "portionUnit"
  | "entryType"
  | "displayOrder"
>;

export type FacilityMenuData = {
  settingsRaw: MenuSettings | null;
  menuItems: MenuItemCycleRow[];
  unavailableReason: string | null;
};

function prismaMenuDelegatesAvailable(client: PrismaClient): boolean {
  const c = client as unknown as Record<string, unknown | undefined>;
  const ms = c.menuSettings;
  const mi = c.menuItem;
  return (
    ms != null &&
    typeof ms === "object" &&
    typeof (ms as { findUnique?: unknown }).findUnique === "function" &&
    mi != null &&
    typeof mi === "object" &&
    typeof (mi as { findMany?: unknown }).findMany === "function"
  );
}

export function isMenuInfrastructureUnavailableError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021") return true;
  }
  return false;
}

export function assertPrismaMenuReady(prisma: PrismaClient): void {
  if (!prismaMenuDelegatesAvailable(prisma)) {
    throw new Error(
      "Menu feature is offline: the running app does not have menu models on the Prisma client. Run `npx prisma generate` and restart the Next.js dev server.",
    );
  }
}

/**
 * Loads menu settings + items, or returns empty data + a reason when the client is stale
 * or menu tables are not present yet (no hard 500 on unit/logs).
 */
export async function loadFacilityMenuData(
  prisma: PrismaClient,
  facilityId: string,
  options?: { menuItemsOrderBy?: Prisma.MenuItemOrderByWithRelationInput[] },
): Promise<FacilityMenuData> {
  if (!prismaMenuDelegatesAvailable(prisma)) {
    return {
      settingsRaw: null,
      menuItems: [],
      unavailableReason:
        "Menu data is unavailable: Prisma client is missing menu models. Run `npx prisma generate` and restart the dev server.",
    };
  }

  try {
    const [settingsRaw, menuItems] = await Promise.all([
      prisma.menuSettings.findUnique({ where: { facilityId } }),
      prisma.menuItem.findMany({
        where: { facilityId },
        select: {
          weekNumber: true,
          dayIndex: true,
          mealPeriodKey: true,
          category: true,
          itemName: true,
          portionValue: true,
          portionUnit: true,
          entryType: true,
          displayOrder: true,
        },
        ...(options?.menuItemsOrderBy ? { orderBy: options.menuItemsOrderBy } : {}),
      }),
    ]);
    return { settingsRaw, menuItems, unavailableReason: null };
  } catch (error) {
    if (isMenuInfrastructureUnavailableError(error)) {
      return {
        settingsRaw: null,
        menuItems: [],
        unavailableReason:
          "Menu tables are not in this database yet. When your migration workflow is ready, apply pending migrations to enable menus (this does not require resetting your database).",
      };
    }
    throw error;
  }
}
