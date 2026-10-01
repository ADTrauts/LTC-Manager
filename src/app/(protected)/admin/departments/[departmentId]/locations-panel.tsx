import Link from "next/link";

import { DepartmentAdminActionForm } from "@/app/(protected)/admin/departments/[departmentId]/action-form";
import { createOperationalTypeAction } from "@/app/(protected)/admin/departments/[departmentId]/actions";
import { LocationsProgrammingClient } from "@/app/(protected)/admin/departments/[departmentId]/locations-programming-client";
import { addRemainingRoomsOfTypeToTeamAction } from "@/app/(protected)/admin/departments/[departmentId]/team-actions";
import { EmptyState } from "@/components/design-system/EmptyState";
import { Button } from "@/components/design-system/Button";
import type { DepartmentAdminView } from "@/lib/department-administration";
import { presentLocationProgramExpansion } from "@/lib/department-administration/location-program-expansion";
import type { LocationRoomInspectView } from "@/lib/department-administration/location-room-inspect";
import { getLocationFunction, listLocationFunctionsForProduct } from "@/lib/department-products/location-functions";
import { isDepartmentProductKey } from "@/lib/department-products/registry";

type Props = {
  view: DepartmentAdminView;
  inspects: Record<string, LocationRoomInspectView>;
  canManage: boolean;
};

/**
 * Department Locations — rooms Facility Builder already assigned to this
 * department. Inspect place, Facility type, and current overlays.
 */
export function LocationsPanel({ view, inspects, canManage }: Props) {
  const expansion = presentLocationProgramExpansion(Object.values(inspects));

  return (
    <div className="max-w-5xl space-y-3" data-testid="department-locations-panel">
      <div
        className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
        data-testid="department-locations-header"
      >
        <div className="min-w-0 space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">Locations</h2>
          <p className="text-sm text-zinc-600">
            Physical places stay in Facility Builder. {view.department.name} binds each place to a
            Location Function from the Department Product.
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

      <LocationFunctionsSection view={view} canManage={canManage} />

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
        <>
          {expansion.remainingCount > 0 ? (
            <section
              className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3"
              data-testid="location-program-expansion"
            >
              <p className="text-sm font-semibold text-zinc-900">
                {expansion.remainingCount === 1
                  ? "1 room is not on a team yet"
                  : `${expansion.remainingCount} rooms are not on a team yet`}
              </p>
              <ul className="mt-2 space-y-2">
                {expansion.groups.map((group) => (
                  <li key={group.facilityRoomTypeId ?? group.facilityTypeLabel}>
                    <p className="text-sm text-zinc-700">
                      {group.facilityTypeLabel}: {group.remaining.map((room) => room.name).join(", ")}
                    </p>
                    {canManage && group.suggestedTeamId ? (
                      <form
                        action={async (formData) => {
                          await addRemainingRoomsOfTypeToTeamAction(formData);
                        }}
                        className="mt-1"
                      >
                        <input type="hidden" name="departmentId" value={view.department.id} />
                        <input type="hidden" name="teamId" value={group.suggestedTeamId} />
                        <input
                          type="hidden"
                          name="spaceIds"
                          value={group.remaining.map((room) => room.spaceId).join(",")}
                        />
                        <Button type="submit" size="compact">
                          Add remaining to {group.suggestedTeamName}
                        </Button>
                      </form>
                    ) : (
                      <p className="mt-1 text-xs text-zinc-500">
                        Open People & Coverage to put these rooms on a team.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <LocationsProgrammingClient view={view} inspects={inspects} canManage={canManage} />
        </>
      )}
    </div>
  );
}

function LocationFunctionsSection({
  view,
  canManage,
}: {
  view: DepartmentAdminView;
  canManage: boolean;
}) {
  const productKey = isDepartmentProductKey(view.department.key) ? view.department.key : null;
  const functions = listLocationFunctionsForProduct(productKey);
  const adoptedKeys = new Set(
    (view.workingProfile?.archetypes ?? []).filter((row) => row.isActive).map((row) => row.key),
  );

  return (
    <section className="space-y-3 rounded-lg border border-zinc-200 bg-white px-4 py-4" data-testid="location-functions">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">Location Functions</h3>
        <p className="mt-1 text-xs text-zinc-600">
          The Department Product owns the function. Typing a label does not create one.
        </p>
      </div>
      {view.locations.length > 0 ? (
        <ul className="space-y-1 text-sm text-zinc-800">
          {view.locations.map((location) => {
            const key = location.patternKey?.startsWith("archetype:")
              ? location.patternKey.slice("archetype:".length)
              : null;
            const known = getLocationFunction(productKey, key);
            const label = known?.label ?? (location.hasPattern ? location.patternLabel : null) ?? "Not bound";
            return (
              <li key={location.id}>
                <span className="font-medium">{location.displayName}</span>
                <span className="text-zinc-600"> · Function: {label}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-zinc-600">Assign rooms in Facility Builder before binding a function.</p>
      )}
      {canManage && productKey && functions.length > 0 ? (
        <DepartmentAdminActionForm action={createOperationalTypeAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="departmentId" value={view.department.id} />
          <label className="text-xs font-medium text-zinc-700">
            Adopt
            <select
              name="functionKey"
              className="mt-1 block min-h-10 rounded-md border border-zinc-300 bg-white px-2 text-sm"
              defaultValue={functions.find((fn) => !adoptedKeys.has(fn.functionKey))?.functionKey ?? functions[0]!.functionKey}
            >
              {functions.map((fn) => (
                <option key={fn.functionKey} value={fn.functionKey}>
                  {fn.label}
                  {adoptedKeys.has(fn.functionKey) ? " (adopted)" : ""}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" size="compact">
            Adopt Location Function
          </Button>
        </DepartmentAdminActionForm>
      ) : null}
    </section>
  );
}
