export const LEGACY_MENU_MIGRATION_DEPARTMENT_KEY = "DIETARY";

export type LegacyMenuFacilitySnapshot = {
  facilityId: string;
  departments: Array<{ id: string; key: string; name: string }>;
  hasSettings: boolean;
  itemCount: number;
};

export type LegacyMenuBackfillPlan =
  | {
      action: "create";
      facilityId: string;
      departmentId: string;
      name: string;
      status: "ACTIVE";
      createDefaultCycleSettings: boolean;
    }
  | {
      action: "skip";
      facilityId: string;
      reason: "no_dietary_department" | "no_legacy_menu_data";
    };

export function planLegacyMenuBackfill(snapshot: LegacyMenuFacilitySnapshot): LegacyMenuBackfillPlan {
  if (!snapshot.hasSettings && snapshot.itemCount === 0) {
    return { action: "skip", facilityId: snapshot.facilityId, reason: "no_legacy_menu_data" };
  }

  const dietary = snapshot.departments.filter((row) => row.key === LEGACY_MENU_MIGRATION_DEPARTMENT_KEY);
  if (dietary.length !== 1) {
    return { action: "skip", facilityId: snapshot.facilityId, reason: "no_dietary_department" };
  }

  const department = dietary[0]!;
  return {
    action: "create",
    facilityId: snapshot.facilityId,
    departmentId: department.id,
    name: `${department.name} Menu`,
    status: "ACTIVE",
    createDefaultCycleSettings: !snapshot.hasSettings && snapshot.itemCount > 0,
  };
}
