import Link from "next/link";

import type { OperationsCenterDashboardData } from "@/lib/operations-center/types";

type BirthdaysCardProps = {
  data: OperationsCenterDashboardData;
};

export function BirthdaysCard({ data }: BirthdaysCardProps) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">Birthdays this month</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Month/day only (no year). Add birthdays on each employee&apos;s profile.
      </p>
      <ul className="mt-3 space-y-1 text-sm text-zinc-700">
        {data.birthdaysThisMonth.map((emp) => (
          <li key={emp.id}>
            <Link href={`/employees#employee-${emp.id}`} className="text-zinc-900 underline hover:text-zinc-700">
              {emp.firstName} {emp.lastName}
            </Link>
            {emp.birthDay != null ? (
              <span className="text-zinc-500">
                {" "}
                — {data.month}/{emp.birthDay}
              </span>
            ) : null}
          </li>
        ))}
        {data.birthdaysThisMonth.length === 0 ? (
          <li className="text-zinc-500">No birthdays on file for this month.</li>
        ) : null}
      </ul>
    </section>
  );
}
