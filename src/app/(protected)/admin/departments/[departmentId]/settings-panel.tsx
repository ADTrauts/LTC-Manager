import Link from "next/link";

import { AppCard, SectionHeader } from "@/components/design-system";
import type { DepartmentAdminView } from "@/lib/department-administration";

type Props = {
  view: DepartmentAdminView;
};

export function SettingsPanel({ view }: Props) {
  const meta = view.workingProfileMeta;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Settings"
        description="Profile identity and links. Facility Builder remains the owner of physical rooms."
      />

      <AppCard title="Department">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Name
            </dt>
            <dd className="mt-1 text-zinc-900">{view.department.name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Key
            </dt>
            <dd className="mt-1 font-mono text-zinc-900">{view.department.key}</dd>
          </div>
        </dl>
      </AppCard>

      <AppCard title="Working profile">
        {meta ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Name
              </dt>
              <dd className="mt-1 text-zinc-900">{meta.name}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Baseline
              </dt>
              <dd className="mt-1 text-zinc-900">{meta.baselineKey ?? "custom"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Version
              </dt>
              <dd className="mt-1 text-zinc-900">v{meta.version}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Status
              </dt>
              <dd className="mt-1 text-zinc-900">{meta.status}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-zinc-600">No profile selected.</p>
        )}
      </AppCard>

      <AppCard title="Related administration">
        <ul className="space-y-2 text-sm">
          <li>
            <Link
              href="/admin/departments"
              className="font-medium text-zinc-900 underline-offset-2 hover:underline"
            >
              Department visibility & heads
            </Link>
          </li>
          <li>
            <Link
              href="/admin/facility/builder"
              className="font-medium text-zinc-900 underline-offset-2 hover:underline"
            >
              Facility Builder (physical rooms & department assignment)
            </Link>
          </li>
        </ul>
        <p className="mt-3 text-xs text-zinc-500">
          Projection, Sidebar, Locations, and operational engines are intentionally
          unchanged by Department Administration.
        </p>
      </AppCard>
    </div>
  );
}
