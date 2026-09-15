import Link from "next/link";

import { EmptyState } from "@/components/design-system/EmptyState";
import { Button } from "@/components/design-system/Button";
import { DepartmentLocationTree } from "@/components/location-tree";
import type { DepartmentAdminView } from "@/lib/department-administration";

type Props = {
  view: DepartmentAdminView;
};

/**
 * Department Locations — read-only, Department-filtered Facility Structure tree.
 * Visual grammar matches Facility Builder Structure; edits stay in Facility Builder.
 */
export function LocationsPanel({ view }: Props) {
  const floorLabel = view.vocabulary.level1.singular;
  const neighborhoodLabel = view.vocabulary.level2.singular;

  return (
    <div className="max-w-5xl space-y-3" data-testid="department-locations-panel">
      <div
        className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
        data-testid="department-locations-header"
      >
        <div className="min-w-0 space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">Locations</h2>
          <p className="text-sm text-zinc-600">Where {view.department.name} operates.</p>
        </div>
        <Link
          href="/admin/facility/builder"
          className="inline-flex shrink-0 self-start text-sm font-medium text-zinc-800 underline-offset-2 hover:underline"
          data-testid="department-locations-manage-link"
        >
          Manage responsibility →
        </Link>
      </div>

      {view.locations.length === 0 ? (
        <EmptyState
          title="No operating locations yet"
          description={`This Department does not have any operating locations yet. Assign Rooms in Facility Builder.`}
          action={
            <Link href="/admin/facility/builder">
              <Button type="button" size="compact">
                Manage responsibility in Facility Builder
              </Button>
            </Link>
          }
          data-testid="department-locations-empty"
        />
      ) : (
        <DepartmentLocationTree
          floors={view.locationHierarchy}
          floorLabel={floorLabel}
          neighborhoodLabel={neighborhoodLabel}
        />
      )}
    </div>
  );
}
