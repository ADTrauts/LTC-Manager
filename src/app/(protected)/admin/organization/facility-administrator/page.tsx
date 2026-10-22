import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/administration/admin-page-header";
import { ROLE_PRIORITY, type AppRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { AUTHORITY_LABEL } from "@/lib/employee-hr-labels";
import {
  DEFAULT_OUTGOING_ROLE,
  HOLDER_GONE_REASON_LABEL,
  listFacilityAdministratorCandidates,
  loadFacilityAdministratorSeat,
  loadLiveFacilityAdministratorInvitation,
  OUTGOING_ROLE_CHOICES,
} from "@/lib/facility-administrator";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceHomeHref } from "@/lib/shell/workspace-home";

import { CancelTransferForm, TransferSection } from "./transfer-forms";

export const dynamic = "force-dynamic";

function formatDate(value: Date, timeZone: string): string {
  return value.toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric", year: "numeric" });
}

export default async function FacilityAdministratorPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (ROLE_PRIORITY[session.role as AppRole] < ROLE_PRIORITY.FACILITY_ADMINISTRATOR) {
    redirect(resolveWorkspaceHomeHref(session));
  }

  const facility = await prisma.facility.findUnique({
    where: { id: session.facilityId },
    select: { id: true, displayName: true, timezone: true },
  });
  if (!facility) redirect(resolveWorkspaceHomeHref(session));

  const [seat, pending, candidates] = await Promise.all([
    loadFacilityAdministratorSeat(prisma, facility.id),
    loadLiveFacilityAdministratorInvitation(prisma, { facilityId: facility.id }),
    listFacilityAdministratorCandidates(prisma, { facilityId: facility.id, excludeUserIds: [session.uid] }),
  ]);
  const isHolder = seat.kind === "HELD" && seat.holder.userId === session.uid;

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="facility-administrator-page">
      <AdminPageHeader
        title="Facility Administrator"
        trail={[{ label: "Organization Settings", href: "/admin/organization" }, { label: "Facility Administrator" }]}
        subtitle={`${facility.displayName} has one Facility Administrator. The role moves only by transfer, and only when the new person accepts.`}
      />

      <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4" data-testid="facility-administrator-holder">
        <h2 className="text-sm font-semibold text-zinc-900">Current Facility Administrator</h2>
        {seat.kind === "EMPTY" ? (
          <p className="mt-1 text-sm text-zinc-600">Nobody holds the role. The parent organization can appoint one.</p>
        ) : (
          <p className="mt-1 text-sm text-zinc-700">
            <span className="font-medium text-zinc-900">{seat.holder.displayName}</span> ({seat.holder.email}), since{" "}
            {formatDate(seat.holder.since, facility.timezone)}.
            {seat.kind === "GONE" ? ` ${HOLDER_GONE_REASON_LABEL[seat.reason]}.` : null}
          </p>
        )}
      </section>

      {pending ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4" data-testid="facility-administrator-pending">
          <h2 className="text-sm font-semibold text-zinc-900">Waiting for an answer</h2>
          <p className="mt-1 text-sm text-zinc-700">
            {pending.invitee.displayName} ({pending.invitee.email}) has been invited to take over
            {pending.kind === "TRANSFER" && pending.outgoingRoleKey
              ? `. When they accept, ${pending.outgoing?.displayName ?? "the current holder"} becomes ${AUTHORITY_LABEL[pending.outgoingRoleKey]}.`
              : " by the parent organization."}{" "}
            Expires {formatDate(pending.expiresAt, facility.timezone)}.
          </p>
          {pending.kind === "TRANSFER" && isHolder ? <CancelTransferForm invitationId={pending.id} /> : null}
        </section>
      ) : null}

      {isHolder ? (
        <TransferSection
          open={!pending}
          candidates={candidates.map((candidate) => ({
            userId: candidate.userId,
            label: `${candidate.displayName} (${candidate.email})${candidate.roleKey ? ` · ${AUTHORITY_LABEL[candidate.roleKey]}` : ""}`,
          }))}
          roleChoices={OUTGOING_ROLE_CHOICES.map((value) => ({ value, label: AUTHORITY_LABEL[value] }))}
          defaultRole={DEFAULT_OUTGOING_ROLE}
        />
      ) : null}
    </div>
  );
}
