import { HarborAuthFrame } from "@/components/harbor-auth-frame";
import { OrganizationMemberAcceptForm } from "@/components/organization-member-accept-form";
import { getAppSession } from "@/lib/auth";
import { normalizeAccountIdentifier } from "@/lib/auth-rate-limit";
import { findAcceptableMemberInvitationByRawToken } from "@/lib/organization-member-invitations";
import {
  organizationDisplayLabel,
  organizationMembershipRoleLabel,
} from "@/lib/organization-membership";
import { prisma } from "@/lib/prisma";

type PageProps = { params: Promise<{ token: string }> };

export default async function OrganizationMemberInviteAcceptPage({ params }: PageProps) {
  const { token: rawTokenParam } = await params;
  const token = decodeURIComponent(rawTokenParam ?? "").trim();
  const invitation = token
    ? await findAcceptableMemberInvitationByRawToken(prisma, token)
    : null;
  if (!invitation) {
    return (
      <HarborAuthFrame
        title="Invitation invalid"
        description="This Organization invitation is invalid, expired, revoked, or already used."
      >
        <p className="text-sm text-[var(--text-secondary)]">
          Ask an Organization Administrator for a new invitation.
        </p>
      </HarborAuthFrame>
    );
  }

  const organization = await prisma.organization.findUnique({
    where: { id: invitation.organizationId },
    select: { name: true, displayName: true, isActive: true },
  });
  if (!organization?.isActive) {
    return (
      <HarborAuthFrame title="Organization unavailable" description="This Organization is inactive.">
        <p className="text-sm text-[var(--text-secondary)]">Contact support.</p>
      </HarborAuthFrame>
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: invitation.targetEmailNormalized },
    select: { passwordHash: true },
  });
  const session = await getAppSession();
  const sessionEmail =
    session?.authKind === "user" ? normalizeAccountIdentifier(session.email ?? "") : null;
  let mode: "new_user" | "existing_authenticated" | "existing_login_required" | "email_mismatch" =
    "new_user";
  if (sessionEmail && sessionEmail !== invitation.targetEmailNormalized) mode = "email_mismatch";
  else if (existingUser?.passwordHash) {
    mode = sessionEmail === invitation.targetEmailNormalized ? "existing_authenticated" : "existing_login_required";
  }

  return (
    <HarborAuthFrame
      title="Organization invitation"
      description="Join this Organization. This does not grant customer Facility access."
    >
      <OrganizationMemberAcceptForm
        token={token}
        targetEmail={invitation.targetEmailNormalized}
        organizationName={organizationDisplayLabel(organization)}
        roleLabel={organizationMembershipRoleLabel(invitation.intendedRole)}
        mode={mode}
      />
    </HarborAuthFrame>
  );
}
