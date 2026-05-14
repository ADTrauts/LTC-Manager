"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogRecurrence, MealType, RoleKey, type UnitType } from "@prisma/client";

import { Drawer } from "@/components/drawer";
import {
  createUnitAction,
  reorderUnitListAction,
  reorderUnitAction,
  toggleUnitActiveAction,
  updateUnitAction,
} from "@/app/(protected)/units/actions";
import {
  createLogAssignmentAction,
  toggleLogAssignmentAction,
} from "@/app/(protected)/logs/actions";
import { unitTypeUsesServingTimes } from "@/lib/unit-type-config";

type UnitMealTime = {
  mealType: MealType;
  scheduledTime: string;
};

type UnitRow = {
  id: string;
  name: string;
  unitType: UnitType;
  parentUnitId: string | null;
  isActive: boolean;
  displayOrder: number;
  description: string | null;
  mealTimes: UnitMealTime[];
};

type ParentOption = {
  id: string;
  name: string;
};

type LogAssignmentRow = {
  id: string;
  unitId: string;
  isActive: boolean;
  recurrence: string;
  mealType: string | null;
  timesPerDay: number;
  template: { name: string };
};

type UnitsManagerProps = {
  units: UnitRow[];
  parentOptions: ParentOption[];
  templates: { id: string; name: string }[];
  logAssignments: LogAssignmentRow[];
  canManageLogAssignments: boolean;
};

function formatMealTime(mealTimes: UnitMealTime[], mealType: MealType) {
  return mealTimes.find((item) => item.mealType === mealType)?.scheduledTime ?? "";
}

const unitTypeOptions: UnitType[] = [
  "SERVERY",
  "KITCHEN",
  "RETAIL",
  "OFFICE",
  "STORAGE",
  "OTHER",
];

function ServingTimeInputs({
  unit,
  visible,
}: {
  unit: UnitRow;
  visible: boolean;
}) {
  if (!visible) return null;

  return (
    <div className="md:col-span-2 xl:col-span-4 space-y-2 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/80 p-3">
      <p className="text-xs font-medium text-zinc-700">Serving times</p>
      <p className="text-xs text-zinc-500">
        Breakfast, lunch, and dinner line times for this servery (24-hour clock).
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Breakfast
          <input
            type="time"
            name="breakfastTime"
            defaultValue={formatMealTime(unit.mealTimes, "BREAKFAST")}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Lunch
          <input
            type="time"
            name="lunchTime"
            defaultValue={formatMealTime(unit.mealTimes, "LUNCH")}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-600">
          Dinner
          <input
            type="time"
            name="dinnerTime"
            defaultValue={formatMealTime(unit.mealTimes, "DINNER")}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
      </div>
    </div>
  );
}

function UnitLogAssignments({
  unitId,
  unitName,
  assignments,
  templates,
  canManageLogAssignments,
}: {
  unitId: string;
  unitName: string;
  assignments: LogAssignmentRow[];
  templates: { id: string; name: string }[];
  canManageLogAssignments: boolean;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="mt-4 border-t border-zinc-100 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-zinc-900">Compliance logs</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Templates from Logs are assigned to this unit. They drive tasks on the unit dashboard and in Log
            submission.
          </p>
        </div>
        {canManageLogAssignments ? (
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Add log template
          </button>
        ) : null}
      </div>

      {!canManageLogAssignments ? (
        <p className="mt-2 text-xs text-zinc-600">
          Only managers can add or change log assignments. You can still complete logs from the unit dashboard
          or{" "}
          <Link href="/logs?tab=submit" className="text-zinc-900 underline">
            Logs → Submit
          </Link>
          .
        </p>
      ) : null}

      <ul className="mt-3 space-y-2">
        {assignments.map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
          >
            <div className="min-w-0 text-zinc-800">
              <span className="font-medium">{a.template.name}</span>
              <span className="text-zinc-500">
                {" "}
                · {a.recurrence}
                {a.mealType ? ` · ${a.mealType}` : ""} · {a.timesPerDay}×/day ·{" "}
                {a.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link
                href={`/logs?tab=submit&assignmentId=${a.id}`}
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100"
              >
                Submit
              </Link>
              {canManageLogAssignments ? (
                <form action={toggleLogAssignmentAction}>
                  <input type="hidden" name="assignmentId" value={a.id} />
                  <input type="hidden" name="isActive" value={String(!a.isActive)} />
                  <button
                    type="submit"
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100"
                  >
                    {a.isActive ? "Deactivate" : "Activate"}
                  </button>
                </form>
              ) : null}
            </div>
          </li>
        ))}
        {assignments.length === 0 ? (
          <li className="text-sm text-zinc-500">
            {canManageLogAssignments
              ? "No templates assigned yet. Add one above, or use Logs → Assignments for the full list."
              : `No log templates assigned to ${unitName} yet.`}
          </li>
        ) : null}
      </ul>

      {canManageLogAssignments ? (
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={`Assign log to ${unitName}`}>
          <form
            action={async (formData) => {
              await createLogAssignmentAction(formData);
              setDrawerOpen(false);
            }}
            className="grid gap-3 md:grid-cols-2"
          >
            <input type="hidden" name="unitId" value={unitId} />
            <select
              name="templateId"
              required
              className="md:col-span-2 rounded-md border border-zinc-300 px-3 py-2 text-sm"
            >
              <option value="">Select template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <select name="recurrence" defaultValue={LogRecurrence.DAILY} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
              {Object.values(LogRecurrence).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <input
              type="number"
              name="timesPerDay"
              min={1}
              max={10}
              defaultValue={1}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <select name="mealType" defaultValue="" className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
              <option value="">No meal binding</option>
              {Object.values(MealType).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <select name="requiredRole" defaultValue="" className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
              <option value="">Any role</option>
              {Object.values(RoleKey).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-zinc-700 md:col-span-2">
              <input type="checkbox" name="isActive" defaultChecked />
              Active
            </label>
            <div className="md:col-span-2">
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
              >
                Assign template
              </button>
            </div>
          </form>
          <p className="mt-4 text-xs text-zinc-500">
            Create or edit the underlying template under{" "}
            <Link href="/logs?tab=templates" className="text-zinc-800 underline">
              Logs → Templates
            </Link>
            .
          </p>
        </Drawer>
      ) : null}
    </div>
  );
}

function UnitCard({
  unit,
  parentOptions,
  templates,
  assignments,
  canManageLogAssignments,
}: {
  unit: UnitRow;
  parentOptions: ParentOption[];
  templates: { id: string; name: string }[];
  assignments: LogAssignmentRow[];
  canManageLogAssignments: boolean;
}) {
  const [unitType, setUnitType] = useState<UnitType>(unit.unitType);
  const [cardOpen, setCardOpen] = useState(false);
  const showServingTimes = unitTypeUsesServingTimes(unitType);

  useEffect(() => {
    setUnitType(unit.unitType);
  }, [unit.unitType]);

  return (
    <article className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <button
        type="button"
        onClick={() => setCardOpen((current) => !current)}
        aria-expanded={cardOpen}
        className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left hover:bg-zinc-50"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900">{unit.name}</p>
          <p className="mt-0.5 text-xs text-zinc-600">
            {unit.unitType} · Order {unit.displayOrder} · {unit.isActive ? "Active" : "Inactive"}
          </p>
        </div>
        <span className={`shrink-0 text-zinc-400 transition-transform ${cardOpen ? "rotate-180" : ""}`} aria-hidden>
          ▼
        </span>
      </button>

      {cardOpen ? (
        <div className="border-t border-zinc-100 p-3">
          <div className="mb-3 flex flex-wrap gap-2">
            <form action={reorderUnitAction}>
              <input type="hidden" name="unitId" value={unit.id} />
              <input type="hidden" name="direction" value="up" />
              <button
                type="submit"
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100"
              >
                Move up
              </button>
            </form>
            <form action={reorderUnitAction}>
              <input type="hidden" name="unitId" value={unit.id} />
              <input type="hidden" name="direction" value="down" />
              <button
                type="submit"
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100"
              >
                Move down
              </button>
            </form>
            <form action={toggleUnitActiveAction}>
              <input type="hidden" name="unitId" value={unit.id} />
              <input type="hidden" name="isActive" value={String(!unit.isActive)} />
              <button
                type="submit"
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100"
              >
                {unit.isActive ? "Deactivate" : "Activate"}
              </button>
            </form>
          </div>
          <form action={updateUnitAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input type="hidden" name="unitId" value={unit.id} />
            <label className="flex flex-col gap-1 text-xs text-zinc-600">
              Unit name
              <input
                name="name"
                defaultValue={unit.name}
                required
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-600">
              Unit type
              <select
                name="unitType"
                value={unitType}
                onChange={(e) => setUnitType(e.target.value as UnitType)}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              >
                {unitTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-600">
              Parent unit
              <select
                name="parentUnitId"
                defaultValue={unit.parentUnitId ?? ""}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              >
                <option value="">No parent unit</option>
                {parentOptions
                  .filter((option) => option.id !== unit.id)
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-600">
              Display order
              <input
                type="number"
                name="displayOrder"
                defaultValue={unit.displayOrder}
                min={1}
                max={9999}
                title="Lower numbers appear higher in the sidebar and unit pickers."
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <span className="font-normal text-zinc-500">Lower = earlier in the sidebar.</span>
            </label>

            <ServingTimeInputs unit={unit} visible={showServingTimes} />

            <label className="md:col-span-2 xl:col-span-4 flex flex-col gap-1 text-xs text-zinc-600">
              Description
              <input
                name="description"
                defaultValue={unit.description ?? ""}
                placeholder="Optional notes for staff"
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-700 md:col-span-2 xl:col-span-4">
              <input type="checkbox" name="isActive" defaultChecked={unit.isActive} />
              Active
            </label>
            <div className="md:col-span-2 xl:col-span-4">
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
              >
                Save changes
              </button>
            </div>
          </form>

          <UnitLogAssignments
            unitId={unit.id}
            unitName={unit.name}
            assignments={assignments}
            templates={templates}
            canManageLogAssignments={canManageLogAssignments}
          />
        </div>
      ) : null}
    </article>
  );
}

export function UnitsManager({
  units,
  parentOptions,
  templates,
  logAssignments,
  canManageLogAssignments,
}: UnitsManagerProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [createUnitType, setCreateUnitType] = useState<UnitType>("SERVERY");
  const [orderedUnits, setOrderedUnits] = useState(units);
  const [draggingUnitId, setDraggingUnitId] = useState<string | null>(null);
  const [dropTargetUnitId, setDropTargetUnitId] = useState<string | null>(null);
  const [orderedUnitIdsPayload, setOrderedUnitIdsPayload] = useState("");
  const reorderFormRef = useRef<HTMLFormElement>(null);
  const showCreateServingTimes = unitTypeUsesServingTimes(createUnitType);

  useEffect(() => {
    setOrderedUnits(units);
  }, [units]);

  function moveUnitBeforeTarget(currentUnits: UnitRow[], draggedUnitId: string, targetUnitId: string) {
    if (draggedUnitId === targetUnitId) return currentUnits;
    const draggedIndex = currentUnits.findIndex((unit) => unit.id === draggedUnitId);
    const targetIndex = currentUnits.findIndex((unit) => unit.id === targetUnitId);
    if (draggedIndex === -1 || targetIndex === -1) return currentUnits;

    const nextUnits = [...currentUnits];
    const [draggedUnit] = nextUnits.splice(draggedIndex, 1);
    const adjustedTargetIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
    nextUnits.splice(adjustedTargetIndex, 0, draggedUnit);
    return nextUnits;
  }

  function submitOrder(nextUnits: UnitRow[]) {
    setOrderedUnitIdsPayload(JSON.stringify(nextUnits.map((unit) => unit.id)));
    requestAnimationFrame(() => {
      reorderFormRef.current?.requestSubmit();
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Unit list</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Fields depend on unit type (e.g. serving times for serveries). Display order controls the sidebar.
            </p>
            <p className="mt-1 text-xs text-zinc-500">Drag and drop cards to reorder the left sidebar list.</p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="shrink-0 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Add unit
          </button>
        </div>

        <form ref={reorderFormRef} action={reorderUnitListAction}>
          <input type="hidden" name="orderedUnitIds" value={orderedUnitIdsPayload} />
        </form>

        <div className="mt-4 space-y-4">
          {orderedUnits.map((unit) => (
            <div
              key={unit.id}
              draggable
              onDragStart={() => {
                setDraggingUnitId(unit.id);
                setDropTargetUnitId(unit.id);
              }}
              onDragEnd={() => {
                setDraggingUnitId(null);
                setDropTargetUnitId(null);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (dropTargetUnitId !== unit.id) {
                  setDropTargetUnitId(unit.id);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (!draggingUnitId || draggingUnitId === unit.id) return;
                const nextUnits = moveUnitBeforeTarget(orderedUnits, draggingUnitId, unit.id);
                setOrderedUnits(nextUnits);
                setDraggingUnitId(null);
                setDropTargetUnitId(null);
                submitOrder(nextUnits);
              }}
              className={
                dropTargetUnitId === unit.id && draggingUnitId && draggingUnitId !== unit.id
                  ? "rounded-lg ring-2 ring-zinc-300 ring-offset-2"
                  : ""
              }
            >
              <UnitCard
                unit={unit}
                parentOptions={parentOptions}
                templates={templates}
                assignments={logAssignments.filter((a) => a.unitId === unit.id)}
                canManageLogAssignments={canManageLogAssignments}
              />
            </div>
          ))}
          {orderedUnits.length === 0 ? (
            <p className="text-sm text-zinc-500">No units yet. Use Add unit to create your first one.</p>
          ) : null}
        </div>
      </section>

      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="Add unit">
        <p className="mb-4 text-sm text-zinc-600">
          New active units appear in the left sidebar. Choose the type first — serveries include scheduled meal
          times; kitchens and other types do not.
        </p>
        <form
          action={async (formData) => {
            await createUnitAction(formData);
            setCreateOpen(false);
          }}
          className="grid gap-3 md:grid-cols-2"
        >
          <label className="flex flex-col gap-1 text-xs text-zinc-600 md:col-span-2">
            Unit name
            <input
              name="name"
              required
              placeholder="Unit name"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600">
            Unit type
            <select
              name="unitType"
              value={createUnitType}
              onChange={(e) => setCreateUnitType(e.target.value as UnitType)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            >
              {unitTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600">
            Parent unit
            <select
              name="parentUnitId"
              defaultValue=""
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            >
              <option value="">No parent unit</option>
              {parentOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-600 md:col-span-2">
            Display order
            <input
              type="number"
              name="displayOrder"
              defaultValue={units.length + 10}
              min={1}
              max={9999}
              title="Lower numbers appear higher in the sidebar."
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <span className="font-normal text-zinc-500">Lower = earlier in the sidebar.</span>
          </label>

          {showCreateServingTimes ? (
            <div className="md:col-span-2 space-y-2 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/80 p-3">
              <p className="text-xs font-medium text-zinc-700">Serving times</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-xs text-zinc-600">
                  Breakfast
                  <input type="time" name="breakfastTime" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
                </label>
                <label className="flex flex-col gap-1 text-xs text-zinc-600">
                  Lunch
                  <input type="time" name="lunchTime" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
                </label>
                <label className="flex flex-col gap-1 text-xs text-zinc-600">
                  Dinner
                  <input type="time" name="dinnerTime" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
                </label>
              </div>
            </div>
          ) : null}

          <label className="flex flex-col gap-1 text-xs text-zinc-600 md:col-span-2">
            Description
            <input
              name="description"
              placeholder="Description (optional)"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700 md:col-span-2">
            <input type="checkbox" name="isActive" defaultChecked />
            Active
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Create unit
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
