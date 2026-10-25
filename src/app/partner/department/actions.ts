"use server";

import { revalidatePath } from "next/cache";

import { getPartnerFacilitySession } from "@/lib/auth";
import { createVendorCatalogForm, publishVendorCatalogForm } from "@/lib/department-authority/catalog-forms";
import { VendorHeadError } from "@/lib/department-authority/vendor-heads";
import { requirePartnerOperationalContext } from "@/lib/partner-operational-context";
import { prisma } from "@/lib/prisma";

export type VendorFormActionResult = { ok: true; message: string } | { ok: false; message: string };

async function headContext() {
  const session = await getPartnerFacilitySession();
  if (!session) return null;
  const context = await requirePartnerOperationalContext();
  return { session, departmentId: context.activeDepartmentId, effectiveRole: context.effectiveRole };
}

export async function createVendorCatalogFormAction(
  _prev: VendorFormActionResult | null,
  formData: FormData,
): Promise<VendorFormActionResult> {
  try {
    const ready = await headContext();
    if (!ready) return { ok: false, message: "Sign in to the vendor account first." };
    await createVendorCatalogForm(prisma, {
      session: ready.session,
      facilityId: ready.session.facilityId,
      departmentId: ready.departmentId,
      effectiveRole: ready.effectiveRole,
      name: String(formData.get("name") ?? ""),
      fieldLabel: String(formData.get("fieldLabel") ?? ""),
    });
    revalidatePath("/partner/department");
    return { ok: true, message: "Form saved as a draft. Publish it when it is ready." };
  } catch (error) {
    if (error instanceof VendorHeadError) return { ok: false, message: error.message };
    return { ok: false, message: error instanceof Error ? error.message : "Could not add the form." };
  }
}

export async function publishVendorCatalogFormAction(
  _prev: VendorFormActionResult | null,
  formData: FormData,
): Promise<VendorFormActionResult> {
  try {
    const ready = await headContext();
    if (!ready) return { ok: false, message: "Sign in to the vendor account first." };
    await publishVendorCatalogForm(prisma, {
      session: ready.session,
      facilityId: ready.session.facilityId,
      departmentId: ready.departmentId,
      definitionId: String(formData.get("definitionId") ?? ""),
      effectiveRole: ready.effectiveRole,
    });
    revalidatePath("/partner/department");
    return { ok: true, message: "Form published. Your team can use it at every facility you run." };
  } catch (error) {
    if (error instanceof VendorHeadError) return { ok: false, message: error.message };
    return { ok: false, message: error instanceof Error ? error.message : "Could not publish the form." };
  }
}
