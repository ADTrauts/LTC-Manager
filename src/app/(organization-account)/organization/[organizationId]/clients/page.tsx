import { notFound, redirect } from "next/navigation";

import { OrganizationClientStaffingList } from "@/components/organization-client-staffing";
import { OrganizationWorkspaceNav } from "@/components/organization-workspace-nav";
import { requireOrganizationSession } from "@/lib/organization-context";
import { organizationDisplayLabel } from "@/lib/organization-membership";
import { listOrganizationClientStaffing } from "@/lib/partner-user-access";
import { prisma } from "@/lib/prisma";

type PageProps = { params: Promise<{ organizationId: string }> };

export default async function OrganizationClientsPage({ params }: PageProps) {
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

  const clients = await listOrganizationClientStaffing(prisma, { organizationId: session.organizationId });

  return (
    <div className="space-y-6" data-testid="organization-clients-page">
      <OrganizationWorkspaceNav organizationId={organizationId} current="clients" isAdmin />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Clients</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Client facilities connected to {organizationDisplayLabel(membership.organization)}. Staffing
          changes are available only where the facility allows this organization to manage assignments.
          This is separate from your personal client access.
        </p>
      </div>
      <OrganizationClientStaffingList clients={clients} />
    </div>
  );
}
