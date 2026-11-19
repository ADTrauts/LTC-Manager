import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { AdministratorInviteRecoveryForm } from "@/components/harbor-console/administrator-invite-recovery-form";
import { CustomerBillingSyncForm } from "@/components/harbor-console/customer-billing-sync-form";
import { SupportHistoryPanel } from "@/components/harbor-console/support-history-panel";
import { isHarborOwnerSession, peekHarborWorkFacilityId, requireHarborStaff } from "@/lib/harbor-console/auth";
import { loadHarborAdministratorActivation } from "@/lib/harbor-console/administrator-activation";
import { loadHarborFacility } from "@/lib/harbor-console/queries";
import { HARBOR_WORK_CLEANUP_PATH, HARBOR_WORK_COOKIE } from "@/lib/harbor-console/session";
import {
  stripeCustomerDashboardUrl,
  stripeSubscriptionDashboardUrl,
} from "@/lib/billing/stripe-dashboard";
import { loadStaffImplementationWorkCounts } from "@/lib/implementation/service";
import { prisma } from "@/lib/prisma";
import { loadSupportFacilityHistory, supportContactHref } from "@/lib/support/history";

export default async function HarborCustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ facilityId: string }>;
  searchParams?: Promise<{ provisioned?: string; invite?: string; user?: string; replayed?: string; requestRecovered?: string }>;
}) {
  const session = await requireHarborStaff();
  const { facilityId } = await params;
  const provisionQuery = searchParams ? await searchParams : {};
  const [facility, browserCookies, workFacilityId] = await Promise.all([
    loadHarborFacility(prisma, facilityId), cookies(), peekHarborWorkFacilityId(),
  ]);
  if (!facility) {
    notFound();
  }
  const [supportHistory, implementationWork, administratorActivation] = await Promise.all([
    loadSupportFacilityHistory(prisma, facility.id),
    workFacilityId ? null : loadStaffImplementationWorkCounts(prisma, { kind: "staff", session, workFacilityId }, facility.id),
    isHarborOwnerSession(session) ? loadHarborAdministratorActivation(prisma, facility.id) : null,
  ]);

  await prisma.harborAuditEvent.create({
    data: {
      staffId: session.uid,
      action: "VIEW_CUSTOMER",
      facilityId: facility.id,
    },
  });

  const stripeHref = facility.stripeCustomerId
    ? stripeCustomerDashboardUrl(facility.stripeCustomerId)
    : facility.stripeSubscriptionId
      ? stripeSubscriptionDashboardUrl(facility.stripeSubscriptionId)
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          <Link href="/console/customers" className="hover:underline">
            Customers
          </Link>
          <span className="mx-1.5 text-[var(--text-secondary)]">/</span>
          <span>{facility.displayName}</span>
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{facility.displayName}</h1>
        <Link href={`/console/customers/organizations/${facility.organizationId}`} className="text-sm text-[var(--text-secondary)] underline underline-offset-2">
          {facility.organizationName}
        </Link>
        {provisionQuery.provisioned === "1" ? (
          <p className="mt-3 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm">
            {provisionQuery.requestRecovered === "1"
              ? "Original provisioning result recovered. This retry did not send an invitation."
              : provisionQuery.replayed === "1"
              ? "Existing Facility reused. No new tenancy was created."
              : provisionQuery.user === "existing"
                ? "Facility provisioned. Existing Vssyl account received Facility Administrator access."
                : provisionQuery.invite === "sent"
                  ? "Facility provisioned. Administrator invite sent."
                  : provisionQuery.invite === "failed"
                    ? "Facility created. Administrator invite could not be delivered."
                    : "Facility provisioned."}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm text-[var(--text-secondary)]">Staff Facility workspace access is paused.</p>
          {browserCookies.has(HARBOR_WORK_COOKIE) ? (
            <Link href={HARBOR_WORK_CLEANUP_PATH} className="text-sm underline">Clear old work session</Link>
          ) : null}
          <Link
            href={`/console/tickets/new?facilityId=${facility.id}`}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--border-strong)] bg-white px-4 text-sm font-semibold"
          >
            Open ticket
          </Link>
          {stripeHref ? (
            <a
              href={stripeHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--border-strong)] bg-white px-4 text-sm font-semibold"
            >
              Open in Stripe
            </a>
          ) : null}
        </div>
      </header>

      <section aria-labelledby="operations-overview" className="rounded-md border border-[var(--border)] bg-white p-4">
        <h2 id="operations-overview" className="text-sm font-semibold">Operations overview</h2>
        <Link href={`/console/customers/${facility.id}/lifecycle`} prefetch={false} className="mt-2 inline-block text-sm underline underline-offset-2">
          Review lifecycle and readiness facts
        </Link>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <OverviewItem title="Setup" status={facility.onboarding} href="#account" action="View setup" />
          <OverviewItem title="Billing" status={facility.billingStatus} href="#billing" action="View billing details" />
          <OverviewItem
            title="Support"
            status={`${supportHistory.active} active · ${supportHistory.waitingOnCustomer} waiting on customer`}
            href={supportHistory.viewAllHref}
            action="View support tickets"
          />
          <OverviewItem
            title="Implementation"
            status={implementationWork
              ? `${implementationWork.open} open · ${implementationWork.unassigned} unassigned`
              : "Clear the old work session to see counts"}
            href={`/console/customers/${facility.id}/implementation`}
            action="View implementation work"
          />
        </div>
      </section>

      <section id="account" className="scroll-mt-4 rounded-md border border-[var(--border)] bg-white p-4">
        <h2 className="text-sm font-semibold">Account</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Field label="Facility name" value={facility.displayName} />
          <Field label="Facility ID" value={facility.id} mono />
          <Field label="Organization" value={facility.organizationName} />
          <Field label="Organization ID" value={facility.organizationId} mono />
          <Field
            label="Primary / admin"
            value={
              facility.primaryAdmin
                ? `${facility.primaryAdmin.name} (${facility.primaryAdmin.email})`
                : "—"
            }
          />
          <Field label="Setup state" value={facility.onboarding} />
          <Field label="Guided setup" value={facility.setupAcknowledged ? "Acknowledged" : "In progress"} />
          <Field label="Billing email" value={facility.billingEmail ?? "—"} />
        </dl>
        {administratorActivation ? (
          <div id="administrator-activation" className="mt-4 scroll-mt-4 border-t border-[var(--border)] pt-3">
            <h3 className="text-sm font-semibold">Administrator activation</h3>
            <p className="mt-1 text-sm">{administratorActivation.label}</p>
            {administratorActivation.expiresAt ? (
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Invitation expiry:{" "}
                <time dateTime={administratorActivation.expiresAt.toISOString()}>
                  {new Intl.DateTimeFormat("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "America/New_York",
                  }).format(administratorActivation.expiresAt)} ET
                </time>
              </p>
            ) : null}
            <p className="mt-1 text-xs text-[var(--text-secondary)]">This status does not confirm email delivery.</p>
            {administratorActivation.recovery ? (
              <AdministratorInviteRecoveryForm
                key={administratorActivation.recovery.periodId}
                facilityId={facility.id}
                target={administratorActivation.recovery}
              />
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-md border border-[var(--border)] bg-white p-4">
        <h2 className="text-sm font-semibold">Licensing</h2>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Current local licensing, installation, Enabled and customer-access facts. Configuration and publication are assessed in the canonical Builders; guided setup is not operational readiness.
        </p>
        <ul className="mt-3 divide-y divide-[var(--border)] text-sm">
          {facility.licensing.map((row) => (
            <li key={row.productKey} className="flex justify-between gap-4 py-2">
              <span>{row.name}</span>
              <span className="text-[var(--text-secondary)]">
                {row.licensed ? "Licensed" : "Not licensed"} · {row.installed ? "Installed" : "Not installed"} · {row.enabled ? "Enabled" : "Disabled"} · {row.customerAccess ? "Customer access available" : "Customer operation unavailable"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section id="billing" className="scroll-mt-4 rounded-md border border-[var(--border)] bg-white p-4">
        <h2 className="text-sm font-semibold">Billing</h2>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Diagnostics only. Stripe owns money; Vssyl owns this local access mirror.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Field label="Billing status" value={facility.billingStatus} />
          <Field label="Billing source" value={facility.billingSource} />
          <Field label="Setup path" value={facility.setupPath} />
          <Field label="Interval" value={facility.billingInterval ?? "—"} />
          <Field
            label="Stripe Customer ID"
            value={facility.stripeCustomerId ?? "No Stripe customer on file"}
            mono
          />
          <Field
            label="Stripe Subscription ID"
            value={facility.stripeSubscriptionId ?? "No Stripe subscription on file"}
            mono
          />
          <Field
            label="Local billing last updated"
            value={
              facility.billingUpdatedAt
                ? facility.billingUpdatedAt.toISOString()
                : "—"
            }
          />
        </dl>
        {!facility.hasBillingRecord && !facility.stripeCustomerId ? (
          <p className="mt-3 text-sm text-[var(--text-secondary)]">
            No Stripe billing record exists for this facility.
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-start gap-3">
          {stripeHref ? (
            <a
              href={stripeHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--border-strong)] bg-white px-4 text-sm font-semibold"
            >
              Open in Stripe
            </a>
          ) : null}
          <CustomerBillingSyncForm facilityId={facility.id} />
        </div>
      </section>

      <section className="rounded-md border border-[var(--border)] bg-white p-4">
        <h2 className="text-sm font-semibold">People</h2>
        {facility.users.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-secondary)]">No active users.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {facility.users.map((user) => (
              <li key={user.email} className="flex justify-between py-2 text-sm">
                <span>
                  {user.name}
                  <span className="ml-2 text-xs text-[var(--text-secondary)]">{user.role}</span>
                </span>
                <span className="text-[var(--text-secondary)]">{user.email}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SupportHistoryPanel
        empty="No support tickets for this facility."
        counts={supportHistory}
        recent={supportHistory.recent}
        viewAllHref={supportHistory.viewAllHref}
        viewAllLabel="View all support tickets"
        extraCounts={[{ label: "Closed", value: supportHistory.closed }]}
        showRequester
      />
      {supportHistory.recentRequesters.length > 0 ? (
        <section className="rounded-md border border-[var(--border)] bg-white p-4">
          <h2 className="text-sm font-semibold">Recent requesters</h2>
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {supportHistory.recentRequesters.map((requester) => (
              <li key={requester.id} className="py-2 text-sm">
                <Link href={supportContactHref(requester.id)} className="font-medium hover:underline">
                  {requester.displayName || requester.email}
                </Link>
                {requester.displayName ? (
                  <p className="text-xs text-[var(--text-secondary)]">{requester.email}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function OverviewItem({ title, status, href, action }: {
  title: string;
  status: string;
  href: string;
  action: string;
}) {
  const linkStyle = "mt-1 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-2";
  return (
    <div className="rounded-md bg-[var(--surface-muted)] px-3 pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{title}</h3>
      <p className="mt-1 text-sm font-medium tabular-nums">{status}</p>
      {href.startsWith("#")
        ? <a className={linkStyle} href={href}>{action}</a>
        : <Link className={linkStyle} href={href} prefetch={false}>{action}</Link>}
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-[var(--text-secondary)]">{label}</dt>
      <dd className={`mt-0.5 break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
