import Link from "next/link";

type SecondaryTeamLinksProps = {
  birthdayCount: number;
};

export function SecondaryTeamLinks({ birthdayCount }: SecondaryTeamLinksProps) {
  return (
    <section className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/80 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Team (secondary)</p>
      <p className="mt-1 text-sm text-zinc-600">
        Employee highlights are outside the operational sweep. Use Administration for roster work.
      </p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link href="/dashboard?tab=employees" className="font-medium text-zinc-800 underline hover:text-zinc-600">
          Birthdays this month{birthdayCount > 0 ? ` (${birthdayCount})` : ""}
        </Link>
        <Link href="/employees" className="font-medium text-zinc-800 underline hover:text-zinc-600">
          Employee roster
        </Link>
      </div>
    </section>
  );
}
