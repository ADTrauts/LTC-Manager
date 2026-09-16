"use client";

import Link from "next/link";
import { useState } from "react";

import {
  ensurePatternDraftAction,
  updateRoomTypeDepartmentUseAction,
} from "@/app/(protected)/admin/departments/[departmentId]/actions";
import { DepartmentAdminActionForm } from "@/app/(protected)/admin/departments/[departmentId]/action-form";
import {
  departmentAdminHref,
  type DepartmentAdminView,
} from "@/lib/department-administration";
import {
  customizedAssociatedRoomCount,
  departmentArchetypeForRoomType,
  groupAssignedRoomsByRoomType,
  roomTypeSupportsDepartmentConfiguration,
  sharedRoomTypeDescription,
  type DepartmentRoomTypeGroup,
} from "@/lib/department-administration/room-types";

type Props = {
  view: DepartmentAdminView;
  canManage: boolean;
  selectedRoomTypeKey?: string | null;
};

export function RoomTypesPanel({ view, canManage, selectedRoomTypeKey }: Props) {
  const groups = groupAssignedRoomsByRoomType(view.locations);
  const selected = selectedRoomTypeKey
    ? groups.find((g) => g.roomTypeKey === selectedRoomTypeKey)
    : null;

  if (selected) {
    return <RoomTypeDetail view={view} group={selected} canManage={canManage} />;
  }

  return (
    <div className="space-y-4" data-testid="department-room-types-panel">
      <div>
        <h2 className="text-base font-semibold text-zinc-900">Room Types</h2>
        <p className="text-sm text-zinc-500">
          Configure how {view.department.name} operates in each kind of room assigned to it.
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-5">
          <p className="text-sm text-zinc-700">
            No rooms are assigned to {view.department.name}.
          </p>
          <Link
            href="/admin/facility/builder"
            className="mt-2 inline-block text-sm font-medium text-zinc-900 underline-offset-2 hover:underline"
          >
            Manage responsibility in Facility Builder
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
          {groups.map((group) => {
            const customized = customizedAssociatedRoomCount(group.rooms);
            return (
              <li
                key={group.roomTypeKey}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
                data-testid="department-room-type-row"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900">{group.label}</p>
                  <p className="text-xs text-zinc-500">
                    {group.rooms.length} room{group.rooms.length === 1 ? "" : "s"}
                    {customized > 0 ? ` · ${customized} customized` : ""}
                    {group.isCustom ? " · Custom" : ""}
                  </p>
                </div>
                <Link
                  href={`${departmentAdminHref(view.department.id, "room-types")}&roomType=${encodeURIComponent(group.roomTypeKey)}`}
                  className="shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  Configure
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RoomTypeDetail({
  view,
  group,
  canManage,
}: {
  view: DepartmentAdminView;
  group: DepartmentRoomTypeGroup;
  canManage: boolean;
}) {
  const supportsConfig = roomTypeSupportsDepartmentConfiguration(group.roomTypeKey);
  const sharedDescription = sharedRoomTypeDescription(group.roomTypeKey);
  const archetype = departmentArchetypeForRoomType({
    departmentKey: view.department.key,
    roomTypeKey: group.roomTypeKey,
    profile: view.workingProfile,
  });
  const customized = customizedAssociatedRoomCount(group.rooms);
  const canAuthor = canManage;
  const savedDescription = (archetype?.description ?? "").trim();
  // Saved department text wins; otherwise seed the editor from the platform preset.
  const aboutText = savedDescription || sharedDescription || "";

  return (
    <div className="space-y-4" data-testid="department-room-type-detail">
      <div>
        <Link
          href={departmentAdminHref(view.department.id, "room-types")}
          className="text-xs font-medium text-zinc-600 hover:underline"
        >
          ← Room Types
        </Link>
        <h2 className="mt-2 text-base font-semibold text-zinc-900">{group.label}</h2>
        <p className="text-sm text-zinc-500">
          Room Type · {view.department.name}
          {" · "}
          {group.rooms.length} associated room{group.rooms.length === 1 ? "" : "s"}
          {customized > 0 ? ` · ${customized} customized` : ""}
        </p>
      </div>

      {supportsConfig ? (
        <AboutRoomTypeSection
          view={view}
          group={group}
          aboutText={aboutText}
          canAuthor={canAuthor}
          hasProfile={Boolean(view.workingProfile)}
          hasArchetype={Boolean(archetype)}
        />
      ) : (
        <section className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
          <h3 className="text-sm font-semibold text-zinc-900">About this Room Type</h3>
          <p className="mt-1 text-sm text-zinc-600">
            Reusable department configuration is available for standard Room Types.
          </p>
        </section>
      )}

      {supportsConfig ? (
        <DepartmentDefaultsSection
          departmentName={view.department.name}
          departmentId={view.department.id}
          roomTypeLabel={group.label}
          hasProfile={Boolean(view.workingProfile)}
          hasArchetype={Boolean(archetype)}
        />
      ) : null}

      <AssociatedRoomsSection rooms={group.rooms} customized={customized} />
    </div>
  );
}

function AboutRoomTypeSection({
  view,
  group,
  aboutText,
  canAuthor,
  hasProfile,
  hasArchetype,
}: {
  view: DepartmentAdminView;
  group: DepartmentRoomTypeGroup;
  aboutText: string;
  canAuthor: boolean;
  hasProfile: boolean;
  hasArchetype: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (!hasProfile) {
    return (
      <section
        className="rounded-lg border border-zinc-200 bg-white px-4 py-3"
        data-testid="room-type-about"
      >
        <h3 className="text-sm font-semibold text-zinc-900">About this Room Type</h3>
        <p className="mt-1 text-sm text-zinc-600">
          No reusable {view.department.name} configuration has been defined for this Room
          Type yet.
        </p>
        {canAuthor ? (
          <DepartmentAdminActionForm action={ensurePatternDraftAction} className="mt-3">
            <input type="hidden" name="departmentId" value={view.department.id} />
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
              data-testid="setup-room-type-configuration"
            >
              Set up configuration
            </button>
          </DepartmentAdminActionForm>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">
            Sign in with password as Manager or above to configure this Room Type.
          </p>
        )}
      </section>
    );
  }

  if (!hasArchetype) {
    return (
      <section
        className="rounded-lg border border-zinc-200 bg-white px-4 py-3"
        data-testid="room-type-about"
      >
        <h3 className="text-sm font-semibold text-zinc-900">About this Room Type</h3>
        <p className="mt-1 text-sm text-zinc-600">
          No reusable {view.department.name} configuration is attached to this Room Type
          yet.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-lg border border-zinc-200 bg-white px-4 py-3"
      data-testid="room-type-about"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">About this Room Type</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            How {view.department.name} uses a {group.label}.
          </p>
        </div>
        {canAuthor && !editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
            data-testid="edit-room-type-about"
          >
            Edit
          </button>
        ) : null}
      </div>

      {canAuthor && editing ? (
        <DepartmentAdminActionForm
          action={updateRoomTypeDepartmentUseAction}
          className="mt-2 space-y-2"
          profileRedirect={{
            departmentId: view.department.id,
            tab: "room-types",
            roomType: group.roomTypeKey,
          }}
        >
          <input type="hidden" name="departmentId" value={view.department.id} />
          <input type="hidden" name="roomTypeKey" value={group.roomTypeKey} />
          <textarea
            name="description"
            rows={4}
            defaultValue={aboutText}
            placeholder={`e.g. A ${group.label.toLowerCase()} used for…`}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
            data-testid="room-type-about-input"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
              data-testid="save-room-type-about"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              data-testid="cancel-room-type-about"
            >
              Cancel
            </button>
          </div>
        </DepartmentAdminActionForm>
      ) : (
        <>
          <p className="mt-2 text-sm text-zinc-700" data-testid="room-type-about-text">
            {aboutText.trim() || "No description yet."}
          </p>
          {!canAuthor ? (
            <p className="mt-2 text-xs text-zinc-500">
              Sign in with password as Manager or above to edit.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

/** Deferred Room Type defaults — no hypothetical builder links. */
function DepartmentDefaultsSection({
  departmentName,
  roomTypeLabel,
  hasProfile,
  hasArchetype,
}: {
  departmentName: string;
  departmentId: string;
  roomTypeLabel: string;
  hasProfile: boolean;
  hasArchetype: boolean;
}) {
  return (
    <section
      className="rounded-lg border border-zinc-200 bg-white px-4 py-3"
      data-testid="room-type-department-defaults"
    >
      <h3 className="text-sm font-semibold text-zinc-900">{departmentName} defaults</h3>
      <p className="mt-0.5 text-xs text-zinc-500">
        What normally applies in a {departmentName} {roomTypeLabel}?
      </p>

      {!hasProfile || !hasArchetype ? (
        <p className="mt-3 text-sm text-zinc-600">
          No reusable {departmentName} configuration has been defined for this Room Type
          yet.
        </p>
      ) : (
        <p className="mt-3 text-sm text-zinc-700">
          No reusable operational defaults have been connected to {roomTypeLabel} yet.
        </p>
      )}
    </section>
  );
}

function AssociatedRoomsSection({
  rooms,
  customized,
}: {
  rooms: DepartmentRoomTypeGroup["rooms"];
  customized: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section
      className="rounded-lg border border-zinc-200 bg-white"
      data-testid="room-type-associated-rooms"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        data-testid="toggle-associated-rooms"
      >
        <span className="text-sm font-semibold text-zinc-900">
          {open ? "▾" : "▸"} Associated rooms ({rooms.length})
          {customized > 0 ? (
            <span className="ml-2 text-xs font-normal text-zinc-500">
              · {customized} customized
            </span>
          ) : null}
        </span>
        <span className="text-xs font-medium text-zinc-500">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open ? (
        <ul className="border-t border-zinc-100 px-4 py-2" data-testid="associated-rooms-list">
          {rooms.map((room) => (
            <li key={room.id} className="border-t border-zinc-50 py-1.5 first:border-t-0">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm text-zinc-900">{room.displayName}</p>
                {room.hasOverrides ? (
                  <span className="shrink-0 text-xs font-medium text-zinc-500">
                    Customized
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-zinc-500">
                {[room.floorName, room.parentNeighborhoodName].filter(Boolean).join(" → ") ||
                  "Location"}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
