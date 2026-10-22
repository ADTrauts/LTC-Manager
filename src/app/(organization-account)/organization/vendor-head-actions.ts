"use server";

import { revalidatePath } from "next/cache";

import { moveInternalVendorStaffToVendorAccounts } from "@/lib/department-authority/vendor-accounts";
import {
  acceptVendorHead,
  assignVendorHead,
  declineVendorHead,
  VendorHeadError,
} from "@/lib/department-authority/vendor-heads";
import { requireOrganizationSession } from "@/lib/organization-context";
import { prisma } from "@/lib/prisma";

export type VendorHeadActionResult = { ok: true; message: string } | { ok: false; message: string };

function failure(error: unknown, fallback: string): VendorHeadActionResult {
  if (error instanceof VendorHeadError) return { ok: false, message: error.message };
  return { ok: false, message: fallback };
}

async function requireMember(organizationId: string) {
  const { session } = await requireOrganizationSession();
  if (session.organizationId !== organizationId) {
    throw new VendorHeadError("NOT_ORGANIZATION_ADMIN", "This organization is not the open workspace.");
  }
  return session;
}

export async function assignVendorHeadAction(
  organizationId: string,
  _prev: VendorHeadActionResult | null,
  formData: FormData,
): Promise<VendorHeadActionResult> {
  try {
    const session = await requireMember(organizationId);
    const departmentId = String(formData.get("departmentId") ?? "");
    const assigneeUserId = String(formData.get("assigneeUserId") ?? "");
    if (!assigneeUserId) return { ok: false, message: "Choose the person who will run this Department." };
    await assignVendorHead(prisma, {
      actorUserId: session.uid,
      organizationId,
      departmentId,
      assigneeUserId,
    });
    revalidatePath(`/organization/${organizationId}/departments`);
    return { ok: true, message: "Head named. They accept before control moves." };
  } catch (error) {
    return failure(error, "Could not name the head.");
  }
}

export async function acceptVendorHeadAction(
  organizationId: string,
  _prev: VendorHeadActionResult | null,
  formData: FormData,
): Promise<VendorHeadActionResult> {
  try {
    const session = await requireMember(organizationId);
    await acceptVendorHead(prisma, {
      actorUserId: session.uid,
      assignmentId: String(formData.get("assignmentId") ?? ""),
    });
    revalidatePath(`/organization/${organizationId}/departments`);
    return { ok: true, message: "You accepted. You run this Department." };
  } catch (error) {
    return failure(error, "Could not accept.");
  }
}

export async function moveVendorStaffAction(
  organizationId: string,
  _prev: VendorHeadActionResult | null,
  formData: FormData,
): Promise<VendorHeadActionResult> {
  try {
    const { session, membership } = await requireOrganizationSession();
    if (session.organizationId !== organizationId || membership.currentRole !== "ORG_ADMIN") {
      throw new VendorHeadError("NOT_ORGANIZATION_ADMIN", "Only a current organization administrator can move accounts.");
    }
    const result = await moveInternalVendorStaffToVendorAccounts(prisma, {
      actorUserId: session.uid,
      organizationId,
      departmentId: String(formData.get("departmentId") ?? ""),
    });
    revalidatePath(`/organization/${organizationId}/departments`);
    return {
      ok: true,
      message: `Moved ${result.moved} account${result.moved === 1 ? "" : "s"}. Left ${result.skipped} in place.`,
    };
  } catch (error) {
    return failure(error, "Could not move the accounts.");
  }
}

export async function declineVendorHeadAction(
  organizationId: string,
  _prev: VendorHeadActionResult | null,
  formData: FormData,
): Promise<VendorHeadActionResult> {
  try {
    const session = await requireMember(organizationId);
    await declineVendorHead(prisma, {
      actorUserId: session.uid,
      assignmentId: String(formData.get("assignmentId") ?? ""),
    });
    revalidatePath(`/organization/${organizationId}/departments`);
    return { ok: true, message: "You declined." };
  } catch (error) {
    return failure(error, "Could not decline.");
  }
}
