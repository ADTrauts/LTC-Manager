"use server";

import { headers, cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  createOrganizationSessionToken,
  getCookieOptions,
  SESSION_COOKIE,
} from "@/lib/auth";
import { requireOrganizationSession } from "@/lib/organization-context";
import {
  listCurrentOrganizationMembershipsForUser,
  OrganizationMembershipError,
} from "@/lib/organization-membership";
import {
  changeOrganizationMemberRole,
  deliverOrganizationMemberInvitation,
  endOrganizationMember,
  inviteOrganizationMember,
  OrganizationMemberInvitationError,
  resendOrganizationMemberInvitation,
  revokeOrganizationMemberInvitation,
} from "@/lib/organization-member-invitations";
import { prisma } from "@/lib/prisma";

export type OrganizationAdminActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

function originFrom(headerStore: Headers): string {
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
}

function mapError(error: unknown, fallback: string): OrganizationAdminActionResult {
  if (error instanceof OrganizationMemberInvitationError || error instanceof OrganizationMembershipError) {
    return { ok: false, message: error.message };
  }
  return { ok: false, message: fallback };
}

async function requireAdmin(organizationId: string) {
  const { session, membership } = await requireOrganizationSession();
  if (session.organizationId !== organizationId || membership.currentRole !== "ORG_ADMIN") {
    throw new OrganizationMemberInvitationError(
      "NOT_ORG_ADMIN",
      "Only a current Organization Administrator can manage members.",
    );
  }
  return session;
}

export async function inviteOrganizationMemberAction(
  organizationId: string,
  _prev: OrganizationAdminActionResult | null,
  formData: FormData,
): Promise<OrganizationAdminActionResult> {
  try {
    const session = await requireAdmin(organizationId);
    const parsed = z
      .object({
        targetEmail: z.string().trim().email().max(320),
        intendedRole: z.enum(["ORG_ADMIN", "ORG_MEMBER"]),
      })
      .safeParse({
        targetEmail: formData.get("targetEmail"),
        intendedRole: formData.get("intendedRole"),
      });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid invitation." };
    }
    const { invitation, rawToken } = await inviteOrganizationMember(prisma, {
      organizationId,
      actorUserId: session.uid,
      targetEmail: parsed.data.targetEmail,
      intendedRole: parsed.data.intendedRole,
    });
    const delivery = await deliverOrganizationMemberInvitation({
      invitationId: invitation.id,
      rawToken,
      origin: originFrom(await headers()),
      inviterName: session.name,
    });
    revalidatePath(`/organization/${organizationId}/members`);
    if (delivery.sent) return { ok: true, message: "Invitation sent." };
    if (delivery.deliveryStatus === "NOT_CONFIGURED") {
      return { ok: true, message: "Invitation created. Email delivery is not configured." };
    }
    return { ok: true, message: "Invitation created. Delivery failed — use Resend." };
  } catch (error) {
    return mapError(error, "Could not invite member.");
  }
}

export async function resendOrganizationMemberInvitationAction(
  formData: FormData,
): Promise<OrganizationAdminActionResult> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const invitationId = String(formData.get("invitationId") ?? "");
  try {
    const session = await requireAdmin(organizationId);
    const { invitation, rawToken } = await resendOrganizationMemberInvitation(prisma, {
      invitationId,
      actorUserId: session.uid,
    });
    const delivery = await deliverOrganizationMemberInvitation({
      invitationId: invitation.id,
      rawToken,
      origin: originFrom(await headers()),
      inviterName: session.name,
    });
    revalidatePath(`/organization/${organizationId}/members`);
    if (delivery.sent) return { ok: true, message: "Invitation resent with a new secure link." };
    return { ok: false, message: "Token rotated, but delivery failed." };
  } catch (error) {
    return mapError(error, "Could not resend invitation.");
  }
}

export async function revokeOrganizationMemberInvitationAction(
  formData: FormData,
): Promise<OrganizationAdminActionResult> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const invitationId = String(formData.get("invitationId") ?? "");
  try {
    const session = await requireAdmin(organizationId);
    await revokeOrganizationMemberInvitation(prisma, {
      invitationId,
      actorUserId: session.uid,
    });
    revalidatePath(`/organization/${organizationId}/members`);
    return { ok: true, message: "Invitation revoked." };
  } catch (error) {
    return mapError(error, "Could not revoke invitation.");
  }
}

export async function changeOrganizationMemberRoleAction(
  formData: FormData,
): Promise<OrganizationAdminActionResult> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const targetUserId = String(formData.get("targetUserId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (role !== "ORG_ADMIN" && role !== "ORG_MEMBER") {
    return { ok: false, message: "Unsupported role." };
  }
  try {
    const session = await requireAdmin(organizationId);
    await changeOrganizationMemberRole(prisma, {
      organizationId,
      actorUserId: session.uid,
      targetUserId,
      role,
    });
    revalidatePath(`/organization/${organizationId}/members`);
    return { ok: true, message: "Member role updated. Their sessions were signed out." };
  } catch (error) {
    return mapError(error, "Could not change role.");
  }
}

export async function endOrganizationMemberAction(
  formData: FormData,
): Promise<OrganizationAdminActionResult> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const targetUserId = String(formData.get("targetUserId") ?? "");
  try {
    const session = await requireAdmin(organizationId);
    await endOrganizationMember(prisma, {
      organizationId,
      actorUserId: session.uid,
      targetUserId,
    });
    revalidatePath(`/organization/${organizationId}/members`);
    return { ok: true, message: "Membership ended. Their sessions were signed out." };
  } catch (error) {
    return mapError(error, "Could not end membership.");
  }
}

export async function switchOrganizationAction(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  const { session } = await requireOrganizationSession();
  const memberships = await listCurrentOrganizationMembershipsForUser(prisma, {
    userId: session.uid,
  });
  const selected = memberships.find((row) => row.organizationId === organizationId);
  if (!selected) {
    throw new OrganizationMemberInvitationError(
      "FORBIDDEN",
      "That Organization is not an active membership.",
    );
  }
  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    select: { id: true, email: true, displayName: true, sessionVersion: true, facilityId: true, roleId: true },
  });
  if (!user) throw new Error("Account missing.");
  const token = await createOrganizationSessionToken({
    uid: user.id,
    authMethod: "PASSWORD",
    name: user.displayName,
    email: user.email,
    organizationId: selected.organizationId,
    sessionVersion: user.sessionVersion,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, getCookieOptions());
  redirect(`/organization/${selected.organizationId}`);
}
