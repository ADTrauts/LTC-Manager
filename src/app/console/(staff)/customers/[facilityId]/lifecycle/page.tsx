import { notFound, redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { FacilitySuspensionForm } from "@/components/harbor-console/facility-suspension-form";

import { ConsoleFact, ConsolePanel, ConsoleReadLink, ConsoleTimestamp } from "@/components/harbor-console/operations-ui";
import { peekHarborWorkFacilityId, requireHarborStaff } from "@/lib/harbor-console/auth";
import { loadHarborCustomerLifecycle } from "@/lib/harbor-console/customer-lifecycle";
import { HARBOR_WORK_CLEANUP_PATH } from "@/lib/harbor-console/session";
import { prisma } from "@/lib/prisma";
import { supportFacilityTicketsHref } from "@/lib/support/history";

export const dynamic = "force-dynamic";

export default async function HarborCustomerLifecyclePage({ params }: { params: Promise<{ facilityId: string }> }) {
  const session = await requireHarborStaff();
  const [{ facilityId }, workFacilityId] = await Promise.all([params, peekHarborWorkFacilityId()]);
  const data = await loadHarborCustomerLifecycle(prisma, session, facilityId, workFacilityId);
  if (data.kind === "unauthorized") redirect("/console/login");
  if (data.kind === "missing") notFound();
  const customerHref = `/console/customers/${encodeURIComponent(data.facility.id)}`;

  return <div className="mx-auto max-w-5xl space-y-6">
    <header className="space-y-2">
      <p className="text-sm"><ConsoleReadLink href={customerHref}>{data.facility.displayName}</ConsoleReadLink> / Lifecycle</p>
      <h1 className="text-2xl font-semibold tracking-tight">Customer lifecycle and readiness</h1>
      <p className="text-sm text-[var(--text-secondary)]">Current tenancy, setup, service, and commercial facts. Guided setup acknowledgment and customer operation eligibility do not certify configuration, published Records, or operational readiness.</p>
      <p className="text-xs text-[var(--text-secondary)]">Snapshot: <ConsoleTimestamp value={data.observedAt} />.</p>
    </header>

    <ConsolePanel title="Manual operational pause" id="operational-pause">
      <p className="font-semibold">{data.suspension.at ? "Operational changes suspended" : "No manual operational pause"}</p>
      {data.suspension.at ? <p>Paused since <ConsoleTimestamp value={data.suspension.at} />. Existing data, billing and Support remain available.</p> : null}
      {data.suspension.history ? <>
        <FacilitySuspensionForm facilityId={data.facility.id} facilityName={data.facility.displayName} suspended={Boolean(data.suspension.at)} revision={data.suspension.revision} requestKey={randomUUID()} />
        {data.suspension.history.length ? <div className="space-y-2 border-t border-[var(--border)] pt-4">
          <h3 className="font-semibold">Recent pause history</h3>
          <p className="text-xs">Showing the newest {data.suspension.history.length} of {data.suspension.total} recorded transitions. Staff names are current display names.</p>
          <ol className="space-y-3">{data.suspension.history.map((entry) => <li key={entry.revision}>
            <p><strong>{entry.suspendedAt ? "Suspended" : "Reactivated"}</strong> · <ConsoleTimestamp value={entry.event.createdAt} /> · {entry.event.staff.displayName}</p>
            <p className="whitespace-pre-wrap break-words">{entry.reason}</p>
          </li>)}</ol>
        </div> : null}
      </> : <p>Only the OWNER can change this pause or read its reasons and history.</p>}
    </ConsolePanel>

    <ConsolePanel title="Continue customer follow-up">
      {data.followUp.length ? <ul className="divide-y divide-[var(--border)]">
        {data.followUp.map((item) => <li key={item.key} className="space-y-2 py-3">
          <h3 className="font-semibold">{item.title}</h3><p className="text-[var(--text-secondary)]">{item.detail}</p>
          <ConsoleReadLink href={item.href}>{item.action}</ConsoleReadLink>
        </li>)}
      </ul> : <p>No follow-up is identified by these metadata checks. This does not certify operational readiness or settle lifecycle policy.</p>}
      <p className="text-xs text-[var(--text-secondary)]">Each link opens the existing owning flow. Opening this page neither sends a message nor changes an invitation, authority, configuration, or billing record.</p>
    </ConsolePanel>

    <ConsolePanel title="Tenancy and Administrator">
      <dl>
        <ConsoleFact label="Organization"><ConsoleReadLink href={`/console/customers/organizations/${encodeURIComponent(data.organization.id)}`}>{data.organization.name}</ConsoleReadLink> · {data.organization.active ? "Active" : "Inactive"}</ConsoleFact>
        <ConsoleFact label="Facility Administrator">{data.administrator.label}</ConsoleFact>
        {data.administrator.activation ? <>
          <ConsoleFact label="Account activation">{data.administrator.activation.label}</ConsoleFact>
          <ConsoleFact label="Invitation expiry"><ConsoleTimestamp value={data.administrator.activation.expiresAt} /></ConsoleFact>
        </> : <ConsoleFact label="Account activation">Owner review required for invitation and account recovery details.</ConsoleFact>}
      </dl>
      <ConsoleReadLink href={`${customerHref}#account`}>Review account{data.administrator.activation ? " and invitation recovery" : ""}</ConsoleReadLink>
    </ConsolePanel>

    <ConsolePanel title="Setup journey">
      <dl>
        <ConsoleFact label="Current journey">{data.setup.label} · {data.setup.path}</ConsoleFact>
        <ConsoleFact label="Setup started"><ConsoleTimestamp value={data.setup.startedAt} /></ConsoleFact>
        <ConsoleFact label="Entry confirmed"><ConsoleTimestamp value={data.setup.entryConfirmedAt} /></ConsoleFact>
        <ConsoleFact label="Setup acknowledged"><ConsoleTimestamp value={data.setup.acknowledgedAt} /></ConsoleFact>
      </dl>
      <p>Customers continue setup through their own sign-in. Harbor status views do not establish a customer session or enter a Facility workspace.</p>
    </ConsolePanel>

    <ConsolePanel title="Service follow-up">
      <dl>
        <ConsoleFact label="Support">{data.support.active} active tickets · {data.support.waiting} waiting on the customer</ConsoleFact>
        <ConsoleFact label="Implementation">{data.implementation ? `${data.implementation.open} open requests · ${data.implementation.unassigned} unassigned` : "Unavailable while a retired Facility work cookie is present"}</ConsoleFact>
      </dl>
      <div className="flex flex-wrap gap-4">
        <ConsoleReadLink href={supportFacilityTicketsHref(data.facility.id)}>Review Support history</ConsoleReadLink>
        {data.implementation ? <ConsoleReadLink href={`${customerHref}/implementation`}>Review Implementation work</ConsoleReadLink> : <ConsoleReadLink href={HARBOR_WORK_CLEANUP_PATH}>Clear retired work context</ConsoleReadLink>}
      </div>
      {data.myWork.total != null && data.myWork.total > 0 ? <div className="space-y-2 border-t border-[var(--border)] pt-3">
        <h3 className="font-semibold">My assigned participating work</h3>
        <p className="text-xs text-[var(--text-secondary)]">Showing {data.myWork.rows.length} of {data.myWork.total} open requests assigned to this login&apos;s staff identity with recorded participation, oldest first.</p>
        <ul className="space-y-2">{data.myWork.rows.map((row) => <li key={row.href}><ConsoleReadLink href={row.href}>Continue request from <ConsoleTimestamp value={row.requestedAt} /></ConsoleReadLink></li>)}</ul>
      </div> : null}
      <p className="text-xs text-[var(--text-secondary)]">Counts disclose no engagement scope or private originals. Existing participation checks still apply to each engagement.</p>
    </ConsolePanel>

    <ConsolePanel title="Commercial and Department access" id="licensing">
      <dl>
        <ConsoleFact label="Billing mirror">{data.billing.label}</ConsoleFact>
        <ConsoleFact label="Mirror last updated"><ConsoleTimestamp value={data.billing.updatedAt} /></ConsoleFact>
        <ConsoleFact label="Unlinked active licenses">{data.unlinkedLicenses}</ConsoleFact>
      </dl>
      {data.products ? <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <caption className="mb-3 text-left text-[var(--text-secondary)]">Canonical Product release, entitlement, installation, and Enabled state determine customer operation eligibility.</caption>
        <thead><tr>{["Department Product", "Release", "Licensed", "Installed", "Enabled", "Entitled", "Customer operation"].map((label) => <th key={label} scope="col" className="p-2 font-semibold">{label}</th>)}</tr></thead>
        <tbody>{data.products.map((item) => <tr key={item.productKey} className="border-t border-[var(--border)]">
          <th scope="row" className="p-2 font-medium">{item.name}</th><td className="p-2">{item.releaseStatus}</td>
          {[item.licensed, item.installed, item.enabled, item.entitled].map((value, index) => <td key={index} className="p-2">{value ? "Yes" : "No"}</td>)}
          <td className="p-2">{data.suspension.at ? "Operational changes paused" : item.operable ? "Eligible" : "Unavailable"}</td>
        </tr>)}</tbody>
      </table></div> : <p>Licensing projection exceeds the bounded detail limit. No readiness result is inferred from partial data; review the Facility directly.</p>}
      <ConsoleReadLink href={`${customerHref}#billing`}>Review billing and authorized reconciliation</ConsoleReadLink>
      <p className="text-xs text-[var(--text-secondary)]">This page reads the local mirror. It does not fetch Stripe data, change licensing, or certify a complete customer launch.</p>
    </ConsolePanel>

    <ConsolePanel title="Lifecycle scope">
      <p>The OWNER can pause or reactivate operational changes with a reason and current password. Existing account recovery, billing, Support and Implementation flows keep their own authorization.</p>
      <p>Full-customer exports, offboarding and deletion remain deferred. Removing a manual pause does not remove separate billing or security restrictions.</p>
    </ConsolePanel>
  </div>;
}
