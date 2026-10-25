"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import {
  createFacilityCatalogForm,
  publishFacilityCatalogForm,
} from "@/lib/department-authority/catalog-forms";
import { resolveDepartmentAccessMap } from "@/lib/department-authority/resolve";
import { VendorHeadError } from "@/lib/department-authority/vendor-heads";
import { prisma } from "@/lib/prisma";

export type FacilityFormActionResult = { ok: true; message: string } | { ok: false; message: string };

async function authorSession(departmentId: string) {
  const session = await getSession();
  if (!session?.facilityId) return null;
  await resolveDepartmentAccessMap(prisma, session, {
    facilityId: session.facilityId,
    departmentIds: [departmentId],
  });
  return { session, departmentId };
}

export async function createFacilityCatalogFormAction(
  _prev: FacilityFormActionResult | null,
  formData: FormData,
): Promise<FacilityFormActionResult> {
  const departmentId = String(formData.get("departmentId") ?? "");
  try {
    const ready = await authorSession(departmentId);
    if (!ready) return { ok: false, message: "Sign in first." };
    await createFacilityCatalogForm(prisma, {
      session: ready.session,
      facilityId: ready.session.facilityId,
      departmentId,
      name: String(formData.get("name") ?? ""),
      fieldLabel: String(formData.get("fieldLabel") ?? ""),
    });
    revalidatePath(`/admin/departments/${departmentId}`);
    return { ok: true, message: "Form saved as a draft. Publish it when it is ready." };
  } catch (error) {
    if (error instanceof VendorHeadError) return { ok: false, message: error.message };
    return { ok: false, message: error instanceof Error ? error.message : "Could not add the form." };
  }
}

export async function publishFacilityCatalogFormAction(
  _prev: FacilityFormActionResult | null,
  formData: FormData,
): Promise<FacilityFormActionResult> {
  const departmentId = String(formData.get("departmentId") ?? "");
  try {
    const ready = await authorSession(departmentId);
    if (!ready) return { ok: false, message: "Sign in first." };
    await publishFacilityCatalogForm(prisma, {
      session: ready.session,
      facilityId: ready.session.facilityId,
      departmentId,
      definitionId: String(formData.get("definitionId") ?? ""),
    });
    revalidatePath(`/admin/departments/${departmentId}`);
    return { ok: true, message: "Form published. It can be placed on a room or asset in this facility." };
  } catch (error) {
    if (error instanceof VendorHeadError) return { ok: false, message: error.message };
    return { ok: false, message: error instanceof Error ? error.message : "Could not publish the form." };
  }
}
