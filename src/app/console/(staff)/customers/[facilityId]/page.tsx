import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomerBillingSyncForm } from "@/components/harbor-console/customer-billing-sync-form";
import { SupportHistoryPanel } from "@/components/harbor-console/support-history-panel";
import { resendHarborProvisionInviteAction } from "../provision-actions";
import { peekHarborWorkFacilityId, requireHarborStaff } from "@/lib/harbor-console/auth";
import { loadHarborFacility } from "@/lib/harbor-console/queries";
import {
  stripeCustomerDashboardUrl,
  stripeSubscriptionDashboardUrl,
} from "@/lib/billing/stripe-dashboard";
import { prisma } from "@/lib/prisma";
import { loadSupportFacilityHistory, supportContactHref } from "@/lib/support/history";

export default async function HarborCustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ facilityId: string }>;
  searchParams?: Promise<{ provisioned?: string; invite?: string; user?: string; replayed?: string }>;
}) {
  const session = await requireHarborStaff();
  const { facilityId } = await params;
  const provisionQuery = searchParams ? await searchParams : {};
  const [facility, activeWorkFacilityId] = await Promise.all([
    loadHarborFacility(prisma, facilityId),
    peekHarborWorkFacilityId(),
  ]);
  if (!facility) {
    notFound();
  }
  const supportHistory = await loadSupportFacilityHistory(prisma, facility.id);

  await prisma.harborAuditEvent.create({
    data: {
      staffId: session.uid,
      action: "VIEW_CUSTOMER",
      facilityId: facility.id,
    },
  });

  const workingHere = activeWorkFacilityId === facility.id;
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
        <p className="text-sm text-[var(--text-secondary)]">{facility.organizationName}</p>
        <p className="mt-2 text-sm font-medium">{facility.isLive ? "Live" : facility.onboarding}</p>
        {provisionQuery.provisioned === "1" ? (
          <p className="mt-3 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm">
            {provisionQuery.replayed === "1"
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
        {provisionQuery.invite === "failed" && facility.primaryAdmin?.invitePending ? (
          <form action={resendAdministratorInviteFormAction} className="mt-3">
            <input type="hidden" name="facilityId" value={facility.id} />
            <input type="hidden" name="userId" value={facility.primaryAdmin.id} />
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--border-strong)] bg-white px-4 text-sm font-semibold"
            >
              Resend administrator invite
            </button>
          </form>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {workingHere ? (
            <>
              <a
                href="/admin/facility/builder"
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--run-aside)] px-4 text-sm font-semibold text-[var(--run-aside-fg)]"
              >
                Continue in facility
              </a>
              <form action="/api/console/work-session/end" method="post">
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--border-strong)] bg-white px-4 text-sm font-semibold"
                >
                  Exit work session
                </button>
              </form>
            </>
          ) : (
            <form action="/api/console/work-session" method="post">
              <input type="hidden" name="facilityId" value={facility.id} />
              <button
                type="submit"
                data-testid="harbor-open-facility"
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--run-aside)] px-4 text-sm font-semibold text-[var(--run-aside-fg)]"
              >
                Open facility
              </button>
            </form>
          )}
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

      <section className="rounded-md border border-[var(--border)] bg-white p-4">
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
          <Field label="Live" value={facility.isLive ? "Live" : "Not live"} />
          <Field label="Billing email" value={facility.billingEmail ?? "—"} />
        </dl>
      </section>

      <section className="rounded-md border border-[var(--border)] bg-white p-4">
        <h2 className="text-sm font-semibold">Licensing</h2>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Local entitlement mirror (`FacilityDepartmentEntitlement`). Not inferred from UI install alone.
        </p>
        <ul className="mt-3 divide-y divide-[var(--border)] text-sm">
          {facility.licensing.map((row) => (
            <li key={row.productKey} className="flex justify-between gap-4 py-2">
              <span>{row.name}</span>
              <span className="text-[var(--text-secondary)]">
                {row.licensed ? "Licensed" : "Not licensed"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-md border border-[var(--border)] bg-white p-4">
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

async function resendAdministratorInviteFormAction(formData: FormData): Promise<void> {
  await resendHarborProvisionInviteAction(formData);
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
