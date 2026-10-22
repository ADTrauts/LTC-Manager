"use server";

import { revalidatePath } from "next/cache";

import { getPartnerFacilitySession } from "@/lib/auth";
import { requirePartnerOperationalContext } from "@/lib/partner-operational-context";
import { VendorHeadError } from "@/lib/department-authority/vendor-heads";
import { createVendorPinWorkforce } from "@/lib/department-authority/vendor-workforce";
import { prisma } from "@/lib/prisma";

export type VendorPeopleActionResult = { ok: true; message: string } | { ok: false; message: string };

export async function createVendorPinWorkforceAction(
  _prev: VendorPeopleActionResult | null,
  formData: FormData,
): Promise<VendorPeopleActionResult> {
  try {
    const session = await getPartnerFacilitySession();
    if (!session) return { ok: false, message: "Sign in to the vendor account first." };
    const context = await requirePartnerOperationalContext();
    await createVendorPinWorkforce(prisma, {
      session,
      departmentId: context.activeDepartmentId,
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      pin: String(formData.get("pin") ?? ""),
    });
    revalidatePath("/partner/people");
    revalidatePath("/partner/department");
    return { ok: true, message: "Staff record added. They sign in with the PIN." };
  } catch (error) {
    if (error instanceof VendorHeadError) return { ok: false, message: error.message };
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return { ok: false, message: "That PIN is already assigned at this facility." };
    }
    return { ok: false, message: "Could not add the staff record." };
  }
}
