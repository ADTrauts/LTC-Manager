import { HarborAuthFrame } from "@/components/harbor-auth-frame";
import { OrganizationClaimAcceptForm } from "@/components/organization-claim-accept-form";
import { getAppSession } from "@/lib/auth";
import { normalizeAccountIdentifier } from "@/lib/auth-rate-limit";
import { findClaimableInvitationByRawToken } from "@/lib/organization-claims";
import { organizationDisplayLabel } from "@/lib/organization-membership";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function OrganizationClaimAcceptPage({ params }: PageProps) {
  const { token: rawTokenParam } = await params;
  const token = decodeURIComponent(rawTokenParam ?? "").trim();

  const claim = token ? await findClaimableInvitationByRawToken(prisma, token) : null;
  if (!claim) {
    return (
      <HarborAuthFrame
        title="Claim link invalid"
        description="This Organization claim invitation is invalid, expired, revoked, or already used."
      >
        <p className="text-sm text-[var(--text-secondary)]">
          Ask Harbor or your Facility Administrator if you need a new invitation.
        </p>
      </HarborAuthFrame>
    );
  }

  const organization = await prisma.organization.findUnique({
    where: { id: claim.organizationId },
    select: { name: true, displayName: true, isActive: true },
  });
  const organizationName = organization
    ? organizationDisplayLabel(organization)
    : "this Organization";

  if (!organization?.isActive) {
    return (
      <HarborAuthFrame
        title="Organization unavailable"
        description="This Organization is inactive and cannot be claimed."
      >
        <p className="text-sm text-[var(--text-secondary)]">Contact Harbor support.</p>
      </HarborAuthFrame>
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: claim.targetEmailNormalized },
    select: { id: true, email: true, passwordHash: true, isActive: true },
  });
  const session = await getAppSession();
  const sessionEmail =
    session?.authKind === "user" ? normalizeAccountIdentifier(session.email ?? "") : null;

  let mode: "new_user" | "existing_authenticated" | "existing_login_required" | "email_mismatch" =
    "new_user";
  if (sessionEmail && sessionEmail !== claim.targetEmailNormalized) {
    mode = "email_mismatch";
  } else if (existingUser?.passwordHash) {
    mode =
      sessionEmail === claim.targetEmailNormalized
        ? "existing_authenticated"
        : "existing_login_required";
  } else {
    mode = "new_user";
  }

  return (
    <HarborAuthFrame
      title="Organization claim"
      description="Secure Harbor-approved bootstrap for the first Organization Administrator."
    >
      <OrganizationClaimAcceptForm
        token={token}
        targetEmail={claim.targetEmailNormalized}
        organizationName={organizationName}
        mode={mode}
        contactName={claim.contactName}
      />
    </HarborAuthFrame>
  );
}
