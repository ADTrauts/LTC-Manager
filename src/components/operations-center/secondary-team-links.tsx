import Link from "next/link";

import { AppCard } from "@/components/design-system/AppCard";
import { SectionHeader } from "@/components/design-system/SectionHeader";

type SecondaryTeamLinksProps = {
  birthdayCount: number;
};

export function SecondaryTeamLinks({ birthdayCount }: SecondaryTeamLinksProps) {
  return (
    <AppCard as="section" className="rounded-lg border-dashed bg-zinc-50/80 shadow-none">
      <SectionHeader
        eyebrow="Team (secondary)"
        muted
        description="Employee highlights are outside the operational sweep. Use Administration for roster work."
        className="mb-2"
      />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link href="/dashboard?tab=employees" className="font-medium text-zinc-800 underline hover:text-zinc-600">
          Birthdays this month{birthdayCount > 0 ? ` (${birthdayCount})` : ""}
        </Link>
        <Link href="/employees" className="font-medium text-zinc-800 underline hover:text-zinc-600">
          Employee roster
        </Link>
      </div>
    </AppCard>
  );
}
