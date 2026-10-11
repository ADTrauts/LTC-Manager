import { notFound, redirect } from "next/navigation";

import { OrganizationPortfolioView } from "@/components/organization-portfolio";
import { OrganizationWorkspaceNav } from "@/components/organization-workspace-nav";
import { typeClasses } from "@/lib/design-system";
import { requireOrganizationSession } from "@/lib/organization-context";
import { organizationDisplayLabel } from "@/lib/organization-membership";
import { listOrganizationPortfolio } from "@/lib/organization-portfolio";
import { prisma } from "@/lib/prisma";

type PageProps = {
  params: Promise<{ organizationId: string }>;
};

export default async function OrganizationPortfolioPage({ params }: PageProps) {
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

  if (session.organizationId !== organizationId) {
    redirect("/organization");
  }
  if (membership.organizationId !== organizationId) {
    notFound();
  }

  const portfolio = await listOrganizationPortfolio(prisma, {
    organizationId,
    userId: session.uid,
  });

  return (
    <div className="space-y-6" data-testid="organization-portfolio">
      <OrganizationWorkspaceNav
        organizationId={organizationId}
        current="portfolio"
        isAdmin={membership.currentRole === "ORG_ADMIN"}
      />
      <div>
        <h1 className={typeClasses.pageTitle}>{organizationDisplayLabel(membership.organization)}</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Facilities and operating relationships visible to this Organization. Portfolio visibility
          does not grant Facility access.
        </p>
      </div>
      <OrganizationPortfolioView portfolio={portfolio} />
    </div>
  );
}
