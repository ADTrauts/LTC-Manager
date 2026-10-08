import { HarborOrganizationClaimActions } from "@/components/harbor-console/organization-claim-actions";
import { HarborOrganizationClaimRequestForm } from "@/components/harbor-console/organization-claim-request-form";
import { requireHarborStaff } from "@/lib/harbor-console/auth";
import {
  listHarborClaimQueue,
  organizationClaimDeliveryStatusLabel,
  organizationClaimInvitationStatusLabel,
} from "@/lib/organization-claims";
import { organizationDisplayLabel } from "@/lib/organization-membership";
import { prisma } from "@/lib/prisma";

function formatTimestamp(date: Date | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

export default async function HarborOrganizationClaimsPage() {
  await requireHarborStaff();
  const [queue, organizations] = await Promise.all([
    listHarborClaimQueue(prisma, { includeTerminal: false }),
    prisma.organization.findMany({
      where: { isActive: true },
      select: { id: true, name: true, displayName: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
  ]);

  return (
    <div className="space-y-8" data-testid="harbor-organization-claims-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organization Claims</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Harbor reviews first Organization Administrator bootstrap requests. Approving does not
          grant Facility access to the recipient.
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4">
        <h2 className="text-sm font-semibold text-zinc-900">Direct Harbor claim request</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Optional bootstrap when no Facility request exists. Still requires Approve to mint a
          token.
        </p>
        <HarborOrganizationClaimRequestForm organizations={organizations} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900">Open claim queue</h2>
        {queue.length === 0 ? (
          <p className="text-sm text-zinc-500">No open Organization claims.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
            {queue.map((claim) => {
              const deliveryLabel = organizationClaimDeliveryStatusLabel(
                claim.lastInvitationDeliveryStatus,
              );
              return (
                <li key={claim.id} className="space-y-3 px-4 py-4" data-testid="harbor-claim-row">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">
                        {organizationDisplayLabel({
                          name: claim.organizationName,
                          displayName: claim.organizationDisplayName,
                        })}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {organizationClaimInvitationStatusLabel(claim.displayStatus)}
                        {" · "}
                        ORG_ADMIN count: {claim.currentOrgAdminCount}
                        {deliveryLabel ? ` · ${deliveryLabel}` : null}
                      </p>
                    </div>
                    <HarborOrganizationClaimActions
                      claimId={claim.id}
                      status={claim.status}
                      displayStatus={claim.displayStatus}
                      deliveryStatus={claim.lastInvitationDeliveryStatus}
                    />
                  </div>
                  <dl className="grid gap-1 text-sm text-zinc-700 sm:grid-cols-2">
                    <div>
                      <dt className="inline font-medium text-zinc-900">Proposed email </dt>
                      <dd className="inline">{claim.targetEmailNormalized}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium text-zinc-900">Requesting Facility </dt>
                      <dd className="inline">
                        {claim.requestingFacilityName ?? "— (Harbor direct)"}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-medium text-zinc-900">Requested by </dt>
                      <dd className="inline">{claim.requestedByEmail ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium text-zinc-900">Requested </dt>
                      <dd className="inline">{formatTimestamp(claim.createdAt)}</dd>
                    </div>
                    {claim.status === "APPROVED" ? (
                      <div>
                        <dt className="inline font-medium text-zinc-900">Invitation delivery </dt>
                        <dd className="inline">
                          {deliveryLabel ?? "Not attempted"}
                          {claim.lastInvitationDeliveredAt
                            ? ` · ${formatTimestamp(claim.lastInvitationDeliveredAt)}`
                            : ""}
                        </dd>
                      </div>
                    ) : null}
                    {claim.lastInvitationDeliveryStatus === "FAILED" &&
                    claim.lastInvitationDeliveryError ? (
                      <div className="sm:col-span-2">
                        <dt className="inline font-medium text-zinc-900">Delivery error </dt>
                        <dd className="inline text-red-700">
                          {claim.lastInvitationDeliveryError}
                        </dd>
                      </div>
                    ) : null}
                    {claim.contactName ? (
                      <div>
                        <dt className="inline font-medium text-zinc-900">Contact name </dt>
                        <dd className="inline">{claim.contactName}</dd>
                      </div>
                    ) : null}
                    {claim.notes ? (
                      <div className="sm:col-span-2">
                        <dt className="inline font-medium text-zinc-900">Notes </dt>
                        <dd className="inline">{claim.notes}</dd>
                      </div>
                    ) : null}
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
