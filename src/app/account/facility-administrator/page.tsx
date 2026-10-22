import { redirect } from "next/navigation";

import { typeClasses } from "@/lib/design-system";
import { AUTHORITY_LABEL } from "@/lib/employee-hr-labels";
import { listFacilityAdministratorInvitationsForInvitee } from "@/lib/facility-administrator";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUserSession } from "@/lib/user-session";

import { InvitationAnswerForms } from "./invitation-forms";

export const dynamic = "force-dynamic";

export default async function FacilityAdministratorInvitationsPage() {
  const session = await getAuthenticatedUserSession();
  if (!session) redirect("/login");

  const invitations = await listFacilityAdministratorInvitationsForInvitee(prisma, { userId: session.uid });

  return (
    <main className="mx-auto max-w-3xl px-4 py-10" data-testid="facility-administrator-invitations-page">
      <h1 className={typeClasses.pageTitle}>Facility Administrator invitations</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Each facility has one Facility Administrator. Nothing changes until you accept.
      </p>

      {invitations.length === 0 ? (
        <p className="mt-8 text-sm text-zinc-600" data-testid="facility-administrator-invitations-empty">
          You have no open invitations.
        </p>
      ) : (
        <ul className="mt-8 space-y-4">
          {invitations.map((invitation) => (
            <li
              key={invitation.id}
              className="rounded-lg border border-zinc-200 bg-white p-4"
              data-testid="facility-administrator-invitation"
            >
              <h2 className="text-lg font-semibold text-zinc-900">{invitation.facilityName}</h2>
              <p className="mt-1 text-sm text-zinc-700">
                {invitation.kind === "TRANSFER"
                  ? `${invitation.invitedBy?.displayName ?? "The current Facility Administrator"} asked you to take over as Facility Administrator.`
                  : `${invitation.invitedBy?.displayName ?? "An admin"} of the parent organization asked you to become Facility Administrator.`}
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                {invitation.kind === "TRANSFER" && invitation.outgoingRoleKey
                  ? `If you accept, ${invitation.outgoing?.displayName ?? "they"} will become ${AUTHORITY_LABEL[invitation.outgoingRoleKey]}.`
                  : invitation.outgoing
                    ? `If you accept, ${invitation.outgoing.displayName}'s Facility Administrator role ends.`
                    : "The role is currently empty."}{" "}
                Expires {invitation.expiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.
              </p>
              <InvitationAnswerForms invitationId={invitation.id} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
