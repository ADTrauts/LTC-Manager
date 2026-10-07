import Link from "next/link";

import {
  operatingModelLabel,
  organizationDisplayLabel,
  type DepartmentOperatorCurrentView,
} from "@/lib/department-operators";
import { toServiceDateKey } from "@/lib/operational-time";

function formatEffectiveSince(date: Date): string {
  const key = toServiceDateKey(date);
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

type Props = {
  departmentId: string;
  current: DepartmentOperatorCurrentView | null;
  manageHref: string;
};

export function DepartmentGovernanceSection({ departmentId, current, manageHref }: Props) {
  void departmentId;
  const organizationLabel = current
    ? organizationDisplayLabel(current.relationship.organization)
    : "Not set";
  const modelLabel = current ? operatingModelLabel(current.operatingModel) : "—";
  const effectiveSince = current
    ? formatEffectiveSince(current.relationship.effectiveFrom)
    : null;
  const accountOrContract =
    current?.relationship.externalAccountCode ||
    current?.relationship.contractReference ||
    null;

  return (
    <section
      className="rounded-lg border border-zinc-200 bg-white px-4 py-4"
      data-testid="department-governance"
    >
      <h2 className="text-sm font-semibold text-zinc-900">Department governance</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Operating organization is who runs this department. It does not grant facility access.
      </p>

      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="text-xs text-zinc-500">Operating organization</dt>
          <dd className="font-medium text-zinc-900" data-testid="operating-organization-name">
            {organizationLabel}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Operating model</dt>
          <dd className="text-zinc-800" data-testid="operating-model-label">
            {modelLabel}
          </dd>
        </div>
        {effectiveSince ? (
          <div>
            <dt className="text-xs text-zinc-500">Effective since</dt>
            <dd className="text-zinc-800" data-testid="operating-effective-since">
              {effectiveSince}
            </dd>
          </div>
        ) : null}
        {accountOrContract ? (
          <div>
            <dt className="text-xs text-zinc-500">Account / contract reference</dt>
            <dd className="text-zinc-800" data-testid="operating-account-reference">
              {accountOrContract}
            </dd>
          </div>
        ) : null}
      </dl>

      <p className="mt-3">
        <Link
          href={manageHref}
          className="text-sm font-medium text-zinc-800 underline underline-offset-2 hover:text-zinc-950"
          data-testid="manage-operating-organization"
        >
          Manage operating organization →
        </Link>
      </p>
    </section>
  );
}
