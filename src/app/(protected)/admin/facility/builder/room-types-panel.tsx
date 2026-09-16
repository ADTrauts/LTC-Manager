"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/design-system/Button";
import { EmptyState } from "@/components/design-system/EmptyState";
import { Select, TextInput } from "@/components/design-system/Field";
import { Drawer } from "@/components/drawer";
import { FACILITY_BASE_TYPES } from "@/lib/facility-builder/facility-base-types";
import type { FacilityRoomTypeView } from "@/lib/facility-builder/load-facility-hierarchy";
import {
  archiveFacilityRoomTypeAction,
  createFacilityRoomTypeAction,
  updateFacilityRoomTypeAction,
} from "./actions";

type Props = {
  roomTypes: FacilityRoomTypeView[];
};

/**
 * Facility Room Type catalog — reusable room classifications for Structure.
 */
export function RoomTypesPanel({ roomTypes }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const activeTypes = roomTypes.filter((row) => row.isActive);
  const editing = editingId ? activeTypes.find((r) => r.id === editingId) ?? null : null;

  function refreshAfter(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        setMessage(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4" data-testid="facility-room-types-panel">
      {message ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {message.text}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Room Types</h2>
          <p className="mt-0.5 text-sm text-zinc-600">
            Shared classifications for Rooms in this facility. Renaming a type does not break room
            assignments.
          </p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)} data-testid="create-room-type-open">
          + Add Room Type
        </Button>
      </div>

      {activeTypes.length === 0 ? (
        <EmptyState
          title="No Room Types yet"
          description="Add categories such as Servery or Kitchen, then assign them to Rooms in Structure."
          action={
            <Button type="button" onClick={() => setCreateOpen(true)}>
              Add Room Type
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white" role="list">
          {activeTypes.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              data-testid="facility-room-type-row"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900">{row.displayName}</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Base type: {row.baseTypeLabel}
                  {" · "}
                  {row.roomCount} {row.roomCount === 1 ? "Room" : "Rooms"}
                </p>
                {row.description ? (
                  <p className="mt-1 text-xs text-zinc-600">{row.description}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  onClick={() => setEditingId(row.id)}
                >
                  Edit
                </Button>
                <form
                  action={async (formData) => {
                    setError(null);
                    const label = row.displayName;
                    const confirmText =
                      row.roomCount > 0
                        ? `"${label}" is used by ${row.roomCount} room(s). It will be archived, not deleted. Continue?`
                        : `Delete "${label}"? This cannot be undone.`;
                    if (!window.confirm(confirmText)) return;

                    startTransition(async () => {
                      try {
                        const result = await archiveFacilityRoomTypeAction(formData);
                        if (result.action === "archived") {
                          setMessage({
                            tone: "success",
                            text: `"${label}" was archived because ${result.roomCount} room(s) still use it.`,
                          });
                        } else if (result.action === "deleted") {
                          setMessage({
                            tone: "success",
                            text: `"${label}" was deleted.`,
                          });
                        } else if (result.action === "blocked") {
                          setMessage({
                            tone: "error",
                            text: `"${label}" could not be archived or deleted.`,
                          });
                        }
                        setEditingId(null);
                        router.refresh();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Archive/delete failed.");
                      }
                    });
                  }}
                >
                  <input type="hidden" name="id" value={row.id} />
                  <Button type="submit" variant="ghost" size="compact" disabled={isPending}>
                    {row.roomCount > 0 ? "Archive" : "Delete"}
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add Room Type"
        size="md"
        data-testid="create-room-type-drawer"
      >
        <form
          className="space-y-3"
          action={async (formData) => {
            refreshAfter(async () => {
              await createFacilityRoomTypeAction(formData);
              setCreateOpen(false);
            });
          }}
        >
          <TextInput
            name="displayName"
            label="Name"
            required
            maxLength={80}
            placeholder="e.g. Servery, Kitchen, Office"
            data-testid="create-room-type-name"
          />
          <Select
            name="baseTypeKey"
            label="Base type"
            required
            defaultValue="guest_room"
            data-testid="create-room-type-base"
          >
            {FACILITY_BASE_TYPES.map((base) => (
              <option key={base.key} value={base.key}>
                {base.label}
              </option>
            ))}
          </Select>
          <TextInput
            name="description"
            label="Description"
            helper="Optional"
            maxLength={500}
            placeholder="How this Room Type is used"
          />
          <Button type="submit" disabled={isPending} data-testid="create-room-type-submit">
            Add Room Type
          </Button>
        </form>
      </Drawer>

      <Drawer
        open={Boolean(editing)}
        onClose={() => setEditingId(null)}
        title={editing ? `Edit ${editing.displayName}` : "Edit Room Type"}
        size="md"
        data-testid="edit-room-type-drawer"
      >
        {editing ? (
          <form
            className="space-y-3"
            action={async (formData) => {
              refreshAfter(async () => {
                await updateFacilityRoomTypeAction(formData);
                setEditingId(null);
              });
            }}
          >
            <input type="hidden" name="id" value={editing.id} />
            <TextInput
              name="displayName"
              label="Name"
              required
              maxLength={80}
              defaultValue={editing.displayName}
            />
            <Select
              name="baseTypeKey"
              label="Base type"
              required
              defaultValue={editing.baseTypeKey}
            >
              {FACILITY_BASE_TYPES.map((base) => (
                <option key={base.key} value={base.key}>
                  {base.label}
                </option>
              ))}
            </Select>
            <TextInput
              name="description"
              label="Description"
              helper="Optional"
              maxLength={500}
              defaultValue={editing.description ?? ""}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={isPending}>
                Save
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditingId(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : null}
      </Drawer>
    </div>
  );
}
