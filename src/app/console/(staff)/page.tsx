import Link from "next/link";

import { requireHarborStaff } from "@/lib/harbor-console/auth";
import { loadHarborToday } from "@/lib/harbor-console/queries";
import { prisma } from "@/lib/prisma";

export default async function HarborTodayPage() {
  await requireHarborStaff();
  const { stuckSetups, paymentProblems } = await loadHarborToday(prisma);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Stuck setups and payment problems. Tickets wait until Postmark is on this product.
        </p>
      </header>

      <section className="grid grid-cols-3 gap-3">
        <Stat value={String(stuckSetups.length)} label="Stuck setups" />
        <Stat value="0" label="Open tickets" muted />
        <Stat value={String(paymentProblems.length)} label="Payment problems" />
      </section>

      <Queue
        title="Stuck setups"
        empty="No facilities are still in setup."
        rows={stuckSetups.map((row) => ({
          href: `/console/customers/${row.id}`,
          title: row.displayName,
          detail: `${row.organizationName} · ${row.onboarding}`,
        }))}
      />
      <Queue
        title="Payment problems"
        empty="No past-due or incomplete billing."
        rows={paymentProblems.map((row) => ({
          href: `/console/customers/${row.id}`,
          title: row.displayName,
          detail: `${row.billingStatus} · ${row.licensedDepartments.join(", ") || "No licensed departments"}`,
        }))}
      />
    </div>
  );
}

function Stat({ value, label, muted }: { value: string; label: string; muted?: boolean }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-white px-4 py-3">
      <p className={`text-2xl font-semibold ${muted ? "text-[var(--text-muted)]" : "text-[var(--brand-accent)]"}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{label}</p>
    </div>
  );
}

function Queue({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: Array<{ href: string; title: string; detail: string }>;
}) {
  return (
    <section className="rounded-md border border-[var(--border)] bg-white">
      <h2 className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-[var(--text-secondary)]">{empty}</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.href} className="border-b border-[var(--border)] last:border-b-0">
              <Link href={row.href} className="block px-4 py-3 hover:bg-[var(--brand-accent-soft)]">
                <p className="text-sm font-medium">{row.title}</p>
                <p className="text-xs text-[var(--text-secondary)]">{row.detail}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
