"use server";

import { revalidatePath } from "next/cache";

import { hasAtLeastRole } from "@/lib/access";
import { getSession, sessionUserIdForFk } from "@/lib/auth";
import { requireDepartmentFeatureEnabled } from "@/lib/department-operations";
import {
  installPlantStarterConfiguration,
  loadPlantStarterState,
} from "@/lib/department-products/plant-starter";

export async function loadPlantStarterAction(input: {
  facilityId: string;
  departmentId: string;
}) {
  const session = await getSession();
  if (!session?.facilityId || session.facilityId !== input.facilityId) {
    throw new Error("Authentication required.");
  }
  if (!hasAtLeastRole(session.role, "MANAGER") || session.authMethod === "QUICK_PIN") {
    throw new Error("Manager or above required to manage starter configuration.");
  }
  await requireDepartmentFeatureEnabled(input.departmentId, "workPlans");
  return loadPlantStarterState(input);
}

export async function installPlantStarterAction(input: {
  facilityId: string;
  departmentId: string;
  selectedIds: string[];
}) {
  const session = await getSession();
  if (!session?.facilityId || session.facilityId !== input.facilityId) {
    throw new Error("Authentication required.");
  }
  if (!hasAtLeastRole(session.role, "MANAGER") || session.authMethod === "QUICK_PIN") {
    throw new Error("Manager or above required to add starter configuration.");
  }
  await requireDepartmentFeatureEnabled(input.departmentId, "workPlans");
  await requireDepartmentFeatureEnabled(input.departmentId, "evidence");
  const result = await installPlantStarterConfiguration(session, {
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    selectedIds: input.selectedIds,
    actor: {
      userId: sessionUserIdForFk(session),
      label: session.name || session.email || null,
    },
  });
  revalidatePath(`/build/departments/${input.departmentId}`);
  revalidatePath("/staffing/work-plans");
  revalidatePath("/staffing/templates");
  return result;
}
