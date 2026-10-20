import { getAppSession } from "@/lib/auth";
import { findSetupManagerInvitation } from "@/lib/onboarding/manager-invitations";
import { prisma } from "@/lib/prisma";
import { ManagerInviteAcceptForm } from "@/components/manager-invite-accept-form";
import { HarborAuthFrame } from "@/components/harbor-auth-frame";
import { AcceptInviteForm } from "@/components/accept-invite-form";

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; kind?: string }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token.trim() : "";

  if (params.kind === "manager") {
    const invitation = await findSetupManagerInvitation(prisma, token);
    if (!invitation) return <HarborAuthFrame title="Invitation invalid" description="This invitation is invalid, expired or already accepted. Ask the Facility Administrator for a new invitation."><p>Sign in to inspect your existing access if you already accepted.</p></HarborAuthFrame>;
    const [user, session] = await Promise.all([
      prisma.user.findUnique({ where: { email: invitation.email }, select: { passwordHash: true } }), getAppSession(),
    ]);
    const matching = session?.authKind === "user" && session.authMethod !== "QUICK_PIN" && session.email?.toLowerCase() === invitation.email;
    const mode = session && !matching ? "wrong_user" : user?.passwordHash ? matching ? "signed_in" : "login" : "new";
    return <HarborAuthFrame title="Manager invitation" description="Accept an explicit invitation to join this Facility."><ManagerInviteAcceptForm token={token} email={invitation.email} facilityName={invitation.facility.displayName} mode={mode} /></HarborAuthFrame>;
  }

  return (
    <HarborAuthFrame
      title="Accept your invite"
      description="Set a password to start using Vssyl for your facility."
    >
      <AcceptInviteForm token={token} />
    </HarborAuthFrame>
  );
}
