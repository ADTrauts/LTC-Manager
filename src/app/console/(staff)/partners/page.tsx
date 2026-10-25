import { requireHarborOwner } from "@/lib/harbor-console/auth";
import { prisma } from "@/lib/prisma";

import { PartnerCompanyForm } from "./partner-company-form";
import { PartnerInviteForms } from "./partner-invite-forms";

export default async function HarborPartnerCompaniesPage() {
  await requireHarborOwner();
  const companies = await prisma.organization.findMany({
    where: { isActive: true, facilities: { none: {} } },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      name: true,
      displayName: true,
      organizationClaimInvitations: {
        where: { status: { in: ["REQUESTED", "APPROVED"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, targetEmailNormalized: true },
      },
      organizationMemberInvitations: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { targetEmailNormalized: true },
      },
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6" data-testid="harbor-partner-companies-page">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Partner companies</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Create a company that does not own a facility, then invite its first administrator and members.
          An invitation opens the company workspace only.
        </p>
      </header>
      <section className="rounded-md border border-[var(--border)] bg-white p-4">
        <PartnerCompanyForm />
      </section>
      <section className="space-y-4">
        {companies.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No partner companies yet.</p>
        ) : (
          companies.map((company) => {
            const claim = company.organizationClaimInvitations[0];
            return (
              <article
                key={company.id}
                className="space-y-4 rounded-md border border-[var(--border)] bg-white p-4"
                data-testid="partner-company-card"
              >
                <div>
                  <h2 className="text-lg font-semibold">{company.displayName?.trim() || company.name}</h2>
                  <p className="text-sm text-[var(--text-secondary)]">No facility.</p>
                  {claim ? (
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      Administrator invitation {claim.status === "APPROVED" ? "sent" : "waiting"} for{" "}
                      {claim.targetEmailNormalized}.
                    </p>
                  ) : null}
                  {company.organizationMemberInvitations.length > 0 ? (
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      Member invitations:{" "}
                      {company.organizationMemberInvitations.map((row) => row.targetEmailNormalized).join(", ")}
                    </p>
                  ) : null}
                </div>
                <PartnerInviteForms organizationId={company.id} />
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
