import Link from "next/link";

import { LocationsProgrammingClient } from "@/app/(protected)/admin/departments/[departmentId]/locations-programming-client";
import { EmptyState } from "@/components/design-system/EmptyState";
import { Button } from "@/components/design-system/Button";
import type { DepartmentAdminView } from "@/lib/department-administration";
import type { LocationRoomInspectView } from "@/lib/department-administration/location-room-inspect";

type Props = {
  view: DepartmentAdminView;
  inspects: Record<string, LocationRoomInspectView>;
  canManage: boolean;
};

/**
 * Department Facility — a composed read of rooms Facility Builder assigned
 * to this department. This screen does not author a room classification.
 */
export function LocationsPanel({ view, inspects, canManage }: Props) {
  return (
    <div className="max-w-5xl space-y-3" data-testid="department-locations-panel">
      <div
        className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
        data-testid="department-locations-header"
      >
        <div className="min-w-0 space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">Locations</h2>
          <p className="text-sm text-zinc-600">
            Facility Builder owns the place and who is responsible. Operating Rhythm, Coverage,
            Records, Assets, and Menus stay with their owners.
          </p>
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
        <LocationsProgrammingClient view={view} inspects={inspects} canManage={canManage} />
      )}
    </div>
  );
}
