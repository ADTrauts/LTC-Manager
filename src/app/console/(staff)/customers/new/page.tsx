import Link from "next/link";

import { ProvisionFacilityForm } from "@/components/harbor-console/provision-facility-form";
import { requireHarborOwner } from "@/lib/harbor-console/auth";
import { listHarborOrganizations } from "@/lib/harbor-console/queries";
import { prisma } from "@/lib/prisma";

export default async function HarborProvisionFacilityPage() {
  await requireHarborOwner();
  const organizations = await listHarborOrganizations(prisma);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          <Link href="/console/customers" className="hover:underline">
            Customers
          </Link>
          <span className="mx-1.5 text-[var(--text-secondary)]">/</span>
          <span>New customer</span>
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Provision Facility</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Create the customer shell. The Facility Administrator completes setup, products, and billing.
        </p>
      </header>
      <ProvisionFacilityForm
        organizations={organizations.map((row) => ({
          id: row.id,
          name: row.name,
          legalName: row.legalName,
          displayName: row.displayName,
          organizationType: row.organizationType,
          facilityCount: row._count.facilities,
        }))}
      />
    </div>
  );
}
