"use server";

import { revalidatePath } from "next/cache";
import type { OrganizationPartnerRole } from "@prisma/client";

import { requireOrganizationSession } from "@/lib/organization-context";
import { OrganizationMembershipError } from "@/lib/organization-membership";
import {
  assignOrganizationClientMember,
  changeOrganizationClientMemberRole,
  endOrganizationClientMemberAccess,
  organizationClientStaffingErrorMessage,
  PartnerUserAccessError,
} from "@/lib/partner-user-access";
import { prisma } from "@/lib/prisma";

export type OrganizationClientStaffingActionResult = { ok: true } | { ok: false; message: string };

const ROLES = ["PARTNER_VIEWER", "PARTNER_OPERATOR", "PARTNER_MANAGER"] as const;

function isPartnerRole(value: string): value is OrganizationPartnerRole {
  return (ROLES as readonly string[]).includes(value);
}

async function requireStaffingAdmin() {
  try {
    const { session, membership } = await requireOrganizationSession();
    if (membership.currentRole !== "ORG_ADMIN" || membership.organizationId !== session.organizationId) {
      return { ok: false as const, message: "Only a current organization administrator can manage staffing." };
    }
    return { ok: true as const, session };
  } catch (error) {
    if (error instanceof OrganizationMembershipError) {
      return { ok: false as const, message: "Only a current organization administrator can manage staffing." };
    }
    return { ok: false as const, message: "Only a current organization administrator can manage staffing." };
  }
}

function readTarget(formData: FormData) {
  const partnershipId = String(formData.get("facilityPartnerOrganizationId") ?? "");
  const targetUserId = String(formData.get("targetUserId") ?? "");
  if (!partnershipId || !targetUserId) return null;
  return { partnershipId, targetUserId };
}

export async function assignOrganizationClientAction(
  formData: FormData,
): Promise<OrganizationClientStaffingActionResult> {
  const admin = await requireStaffingAdmin();
  if (!admin.ok) return admin;
  const target = readTarget(formData);
  const partnerRole = String(formData.get("partnerRole") ?? "");
  if (!target || !isPartnerRole(partnerRole)) {
    return { ok: false, message: "Choose a member and a partner role." };
  }
  try {
    await assignOrganizationClientMember(prisma, {
      actorUserId: admin.session.uid,
      sessionOrganizationId: admin.session.organizationId,
      partnershipId: target.partnershipId,
      targetUserId: target.targetUserId,
      partnerRole,
    });
    revalidatePath(`/organization/${admin.session.organizationId}/clients`);
    revalidatePath(`/organization/${admin.session.organizationId}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof PartnerUserAccessError) {
      return { ok: false, message: organizationClientStaffingErrorMessage(error) };
    }
    return { ok: false, message: organizationClientStaffingErrorMessage(error) };
  }
}

export async function changeOrganizationClientRoleAction(
  formData: FormData,
): Promise<OrganizationClientStaffingActionResult> {
  const admin = await requireStaffingAdmin();
  if (!admin.ok) return admin;
  const target = readTarget(formData);
  const partnerRole = String(formData.get("partnerRole") ?? "");
  if (!target || !isPartnerRole(partnerRole)) {
    return { ok: false, message: "Choose a partner role." };
  }
  try {
    await changeOrganizationClientMemberRole(prisma, {
      actorUserId: admin.session.uid,
      sessionOrganizationId: admin.session.organizationId,
      partnershipId: target.partnershipId,
      targetUserId: target.targetUserId,
      partnerRole,
    });
    revalidatePath(`/organization/${admin.session.organizationId}/clients`);
    revalidatePath(`/organization/${admin.session.organizationId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: organizationClientStaffingErrorMessage(error) };
  }
}

export async function endOrganizationClientAccessAction(
  formData: FormData,
): Promise<OrganizationClientStaffingActionResult> {
  const admin = await requireStaffingAdmin();
  if (!admin.ok) return admin;
  const target = readTarget(formData);
  if (!target) return { ok: false, message: "Choose a member." };
  try {
    await endOrganizationClientMemberAccess(prisma, {
      actorUserId: admin.session.uid,
      sessionOrganizationId: admin.session.organizationId,
      partnershipId: target.partnershipId,
      targetUserId: target.targetUserId,
    });
    revalidatePath(`/organization/${admin.session.organizationId}/clients`);
    revalidatePath(`/organization/${admin.session.organizationId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: organizationClientStaffingErrorMessage(error) };
  }
}
