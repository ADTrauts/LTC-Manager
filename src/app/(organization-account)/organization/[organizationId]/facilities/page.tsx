import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  AppointFacilityAdministratorForm,
  CancelRecoveryForm,
} from "@/components/organization-facility-administrator-forms";
import { AUTHORITY_LABEL } from "@/lib/employee-hr-labels";
import {
  HOLDER_GONE_REASON_LABEL,
  listOrganizationFacilityAdministratorSeats,
} from "@/lib/facility-administrator";
import { requireOrganizationSession } from "@/lib/organization-context";
import { organizationDisplayLabel } from "@/lib/organization-membership";
import { prisma } from "@/lib/prisma";

type PageProps = { params: Promise<{ organizationId: string }> };

function formatDate(value: Date): string {
  return value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function OrganizationFacilitiesPage({ params }: PageProps) {
  const { organizationId } = await params;
  let session;
  let membership;
  try {
    const required = await requireOrganizationSession();
    session = required.session;
    membership = required.membership;
  } catch {
    redirect("/login");
  }
  if (session.organizationId !== organizationId) redirect("/organization");
  if (membership.currentRole !== "ORG_ADMIN") notFound();

  const rows = await listOrganizationFacilityAdministratorSeats(prisma, { organizationId });

  return (
    <div className="space-y-6" data-testid="organization-facilities-page">
      <div>
        <p className="text-xs text-zinc-500">
          <Link href={`/organization/${organizationId}`} className="underline-offset-2 hover:underline">
            {organizationDisplayLabel(membership.organization)}
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Facilities</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Each facility has one Facility Administrator. You can appoint one only when the role is empty or its holder
          has left; otherwise the current holder transfers it, or Vssyl support helps. Appointing grants you no
          facility access.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-600">This organization has no facilities.</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((row) => (
            <li
              key={row.facilityId}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-4"
              data-testid="organization-facility-administrator-row"
              data-facility-id={row.facilityId}
            >
              <h2 className="text-sm font-semibold text-zinc-900">{row.facilityName}</h2>
              <p className="mt-1 text-sm text-zinc-700" data-testid="organization-facility-administrator-seat">
                {row.seat.kind === "EMPTY"
                  ? "No Facility Administrator."
                  : `Facility Administrator: ${row.seat.holder.displayName} (${row.seat.holder.email}), since ${formatDate(row.seat.holder.since)}.`}
                {row.seat.kind === "GONE" ? ` ${HOLDER_GONE_REASON_LABEL[row.seat.reason]}.` : null}
              </p>

              {row.pending ? (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-sm text-zinc-700">
                    Waiting for {row.pending.invitee.displayName} ({row.pending.invitee.email}) to accept
                    {row.pending.kind === "TRANSFER" && row.pending.outgoingRoleKey
                      ? ` a transfer; ${row.pending.outgoing?.displayName ?? "the holder"} would become ${AUTHORITY_LABEL[row.pending.outgoingRoleKey]}`
                      : ""}
                    . Expires {formatDate(row.pending.expiresAt)}.
                  </p>
                  {row.pending.kind === "RECOVERY" ? (
                    <CancelRecoveryForm organizationId={organizationId} invitationId={row.pending.id} />
                  ) : null}
                </div>
              ) : null}
              <AppointFacilityAdministratorForm
                organizationId={organizationId}
                facilityId={row.facilityId}
                open={!row.pending && row.seat.kind !== "HELD"}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
