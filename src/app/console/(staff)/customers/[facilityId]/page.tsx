import { notFound } from "next/navigation";

import { peekHarborWorkFacilityId, requireHarborStaff } from "@/lib/harbor-console/auth";
import { loadHarborFacility } from "@/lib/harbor-console/queries";
import { prisma } from "@/lib/prisma";

export default async function HarborCustomerPage({
  params,
}: {
  params: Promise<{ facilityId: string }>;
}) {
  const session = await requireHarborStaff();
  const { facilityId } = await params;
  const [facility, activeWorkFacilityId] = await Promise.all([
    loadHarborFacility(prisma, facilityId),
    peekHarborWorkFacilityId(),
  ]);
  if (!facility) {
    notFound();
  }

  await prisma.harborAuditEvent.create({
    data: {
      staffId: session.uid,
      action: "VIEW_CUSTOMER",
      facilityId: facility.id,
    },
  });

  const workingHere = activeWorkFacilityId === facility.id;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
          Customer
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{facility.displayName}</h1>
        <p className="text-sm text-[var(--text-secondary)]">{facility.organizationName}</p>
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
        </div>
      </header>

      <section className="rounded-md border border-[var(--border)] bg-white p-4">
        <h2 className="text-sm font-semibold">Account</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Field label="Billing email" value={facility.billingEmail ?? "—"} />
          <Field label="Setup" value={facility.onboarding} />
          <Field label="Billing" value={facility.billingStatus} />
          <Field label="Path" value={facility.setupPath} />
          <Field
            label="Licensed departments"
            value={facility.licensedDepartments.join(", ") || "None"}
          />
        </dl>
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
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--text-secondary)]">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
