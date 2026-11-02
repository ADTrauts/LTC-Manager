"use client";

import { useState } from "react";
import Link from "next/link";

import { DepartmentAdminActionForm } from "@/app/(protected)/admin/departments/[departmentId]/action-form";
import { removeRoomLogAction } from "@/app/(protected)/admin/departments/[departmentId]/location-room-actions";
import { DepartmentLocationTree } from "@/components/location-tree";
import { GuardedModal } from "@/components/guarded-modal";
import { Button } from "@/components/design-system/Button";
import type { DepartmentAdminView } from "@/lib/department-administration";
import type { LocationRoomInspectView } from "@/lib/department-administration/location-room-inspect";
import { formatCycleWindow } from "@/lib/operational-cycles/cycle-display";

type Props = {
  view: DepartmentAdminView;
  inspects: Record<string, LocationRoomInspectView>;
  canManage: boolean;
};

export function LocationsProgrammingClient({ view, inspects, canManage }: Props) {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const selectedRoom = view.locations.find((location) => location.id === selectedRoomId) ?? null;
  const inspect = selectedRoomId ? inspects[selectedRoomId] ?? null : null;

  return (
    <div className="space-y-3" data-testid="department-locations-programming">
      <p className="text-xs text-zinc-500">
        {view.locationCoverage.roomCount}{" "}
        {view.locationCoverage.roomCount === 1 ? "room" : "rooms"}
      </p>

      <DepartmentLocationTree
        floors={view.locationHierarchy}
        floorLabel={view.vocabulary.level1.singular}
        neighborhoodLabel={view.vocabulary.level2.singular}
        selectedRoomId={selectedRoomId}
        onSelectRoom={(room) => setSelectedRoomId(room.id)}
      />

      <GuardedModal
        open={Boolean(selectedRoom)}
        onClose={() => setSelectedRoomId(null)}
        title={selectedRoom?.displayName ?? "Location"}
        dirty={false}
        closeLabel="Close"
        size="md"
        data-testid="location-program-inspector"
      >
        {selectedRoom && inspect ? (
          <LocationRoomInspector inspect={inspect} canManage={canManage} />
        ) : selectedRoom ? (
          <p className="text-sm text-zinc-600">
            This room is assigned to {view.department.name}.
          </p>
        ) : null}
      </GuardedModal>
    </div>
  );
}

function LocationRoomInspector({
  inspect,
  canManage,
}: {
  inspect: LocationRoomInspectView;
  canManage: boolean;
}) {
  const place = [inspect.place, inspect.facilityTypeLabel ? `Facility type: ${inspect.facilityTypeLabel}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-5 text-sm" data-testid="location-program-inspector-body">
      <section className="space-y-1" data-testid="location-program-place">
        <p className="text-xs text-zinc-500" data-testid="location-program-physical-type">
          {place || "Facility hierarchy"}
        </p>
        <p className="text-xs text-zinc-600" data-testid="location-program-responsibility">
          {inspect.responsible
            ? `${inspect.departmentName} is responsible.`
            : `${inspect.departmentName} is not marked responsible for this room.`}
        </p>
      </section>

      <section className="space-y-2" data-testid="location-program-teams">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Teams that work here
        </h3>
        {inspect.teams.length === 0 ? (
          <p className="text-xs text-zinc-400">No teams include this room.</p>
        ) : (
          <ul className="space-y-1">
            {inspect.teams.map((team) => (
              <li key={team.id} className="text-xs text-zinc-800">
                <span className="font-medium">{team.name}</span>
                <span className="block text-zinc-400">{team.provenance.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2" data-testid="location-program-cycles">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Cycles that landed here
        </h3>
        {inspect.cycles.length === 0 ? (
          <p className="text-xs text-zinc-400">No cycles land on this room yet.</p>
        ) : (
          <ul className="space-y-2">
            {inspect.cycles.map((cycle) => (
              <li key={cycle.cycleStableKey}>
                <p className="text-xs font-medium text-zinc-800">{cycle.label}</p>
                <p className="text-xs text-zinc-500">
                  {formatCycleWindow(cycle.startLocal, cycle.endLocal)}
                  {" · "}
                  {cycle.provenance.detail}
                </p>
                {cycle.teams.length > 0 ? (
                  <ul className="mt-1 space-y-0.5">
                    {cycle.teams.map((team) => (
                      <li key={team.teamId} className="text-xs text-zinc-600">
                        {team.teamName} works this cycle
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2" data-testid="location-program-coverage">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Coverage</h3>
        {inspect.coverage.length === 0 ? (
          <p className="text-xs text-zinc-400">No coverage need is stored for this room.</p>
        ) : (
          <ul className="space-y-1">
            {inspect.coverage.map((need) => (
              <li key={need.id} className="text-xs text-zinc-700">
                {need.cycleLabel ?? "Operating period"} · {need.roleLabel} · {need.requiredCount}{" "}
                required
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2" data-testid="location-program-logs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Logs</h3>
          {canManage && inspect.addLogHref ? (
            <Link
              href={inspect.addLogHref}
              className="text-xs font-medium text-zinc-800 underline-offset-2 hover:underline"
              data-testid="location-add-room-log"
            >
              + Add log
            </Link>
          ) : null}
        </div>
        {inspect.logs.length === 0 ? (
          <p className="text-xs text-zinc-400">No logs on this room or its assets.</p>
        ) : (
          <ul className="space-y-2">
            {inspect.logs.map((log) => (
              <li key={log.id} className="text-xs text-zinc-800">
                <p className="font-medium">{log.label}</p>
                <p className="text-zinc-400">{log.provenance.detail}</p>
                {canManage && log.canRemove && log.attachmentId ? (
                  <DepartmentAdminActionForm action={removeRoomLogAction} className="mt-1">
                    <input type="hidden" name="departmentId" value={inspect.departmentId} />
                    <input type="hidden" name="attachmentId" value={log.attachmentId} />
                    <Button type="submit" variant="secondary" size="compact">
                      Remove
                    </Button>
                  </DepartmentAdminActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2" data-testid="location-program-assets">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Assets</h3>
        {inspect.assets.length === 0 ? (
          <p className="text-xs text-zinc-400">No assets placed in this room.</p>
        ) : (
          <ul className="space-y-1">
            {inspect.assets.map((asset) => (
              <li key={asset.id} className="text-xs text-zinc-800">
                <Link href={asset.href} className="font-medium underline-offset-2 hover:underline">
                  {asset.name}
                  {asset.code ? ` (${asset.code})` : ""}
                </Link>
                <span className="block text-zinc-400">From Asset Builder</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
