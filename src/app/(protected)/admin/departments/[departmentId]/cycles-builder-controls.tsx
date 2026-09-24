"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Drawer } from "@/components/drawer";
import {
  KeyTimeGroupsEditor,
  RoomPicker,
} from "@/components/operational-cycles/room-picker";
import { DepartmentAdminFormCloseContext } from "@/app/(protected)/admin/departments/[departmentId]/action-form";
import {
  formatDaysSummary,
  formatServiceDateLong,
  serializeDaysOfWeek,
  WEEKDAY_SHORT,
} from "@/lib/operational-cycles/cycle-display";
import {
  locationModeFromUserScope,
  mealTimeNeighborhoodCandidates,
  shouldShowServiceStartTimes,
  userFacingScopeFromMode,
  type CycleScopeLocationOption,
  type CycleUserScope,
  type StandardRoomTypeOption,
} from "@/lib/operational-cycles/cycle-scope";

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm";

export function DayOfWeekPicker({
  name = "applicableDaysOfWeek",
  defaultDays,
}: {
  name?: string;
  defaultDays: number[];
}) {
  const initial = defaultDays.length ? defaultDays : [0, 1, 2, 3, 4, 5, 6];
  const [selected, setSelected] = useState<number[]>(() =>
    [...new Set(initial)].sort((a, b) => a - b),
  );
  const allSelected = selected.length === 7;

  function toggle(day: number) {
    setSelected((prev) => {
      const has = prev.includes(day);
      const next = has ? prev.filter((d) => d !== day) : [...prev, day];
      return [...new Set(next)].sort((a, b) => a - b);
    });
  }

  function setEveryDay() {
    setSelected([0, 1, 2, 3, 4, 5, 6]);
  }

  return (
    <div className="sm:col-span-2">
      <p className="text-xs font-medium text-zinc-700">Days</p>
      <input type="hidden" name={name} value={serializeDaysOfWeek(selected)} />
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={setEveryDay}
          className={`rounded-md px-2.5 py-1 text-xs font-medium ${
            allSelected
              ? "bg-zinc-900 text-white"
              : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
          }`}
        >
          Every day
        </button>
        {WEEKDAY_SHORT.map((label, day) => {
          const on = selected.includes(day);
          return (
            <button
              key={label}
              type="button"
              onClick={() => toggle(day)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                on
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">{formatDaysSummary(selected)}</p>
    </div>
  );
}

export function ScheduleActivationControls({
  todayKey,
  nextDayKey,
  minDateKey,
  allowImmediate = true,
}: {
  todayKey: string;
  nextDayKey: string;
  minDateKey: string;
  /** Show same-day publish when a current config already exists. */
  allowImmediate?: boolean;
}) {
  const [mode, setMode] = useState<"next_operational_day" | "immediate" | "choose_date">(
    "next_operational_day",
  );

  return (
    <div className="space-y-3" data-testid="schedule-activation-controls">
      <p className="text-xs font-medium text-zinc-700">When should these changes take effect?</p>
      <label className="flex items-start gap-2 text-sm text-zinc-800">
        <input
          type="radio"
          name="activationMode"
          value="next_operational_day"
          checked={mode === "next_operational_day"}
          onChange={() => setMode("next_operational_day")}
          className="mt-1"
          data-testid="activation-next-day"
        />
        <span>
          Next operational day
          <span className="block text-xs text-zinc-500">
            {formatServiceDateLong(nextDayKey)} — today’s Run stays unchanged
          </span>
        </span>
      </label>
      {allowImmediate ? (
        <label className="flex items-start gap-2 text-sm text-zinc-800">
          <input
            type="radio"
            name="activationMode"
            value="immediate"
            checked={mode === "immediate"}
            onChange={() => setMode("immediate")}
            className="mt-1"
            data-testid="activation-immediate"
          />
          <span>
            Publish immediately (testing override)
            <span className="block text-xs text-amber-800">
              {formatServiceDateLong(todayKey)} — applies this configuration to today’s Run
              immediately. Use for testing only.
            </span>
          </span>
        </label>
      ) : null}
      {mode === "immediate" && allowImmediate ? (
        <div
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950"
          data-testid="immediate-publish-warning"
        >
          <p className="font-semibold">Today’s Run will switch to this configuration immediately.</p>
          <label className="mt-2 flex items-start gap-2">
            <input
              type="checkbox"
              name="confirmImmediate"
              value="1"
              required
              className="mt-0.5"
              data-testid="confirm-immediate-checkbox"
            />
            <span>I understand — publish for today</span>
          </label>
        </div>
      ) : null}
      <label className="flex items-start gap-2 text-sm text-zinc-800">
        <input
          type="radio"
          name="activationMode"
          value="choose_date"
          checked={mode === "choose_date"}
          onChange={() => setMode("choose_date")}
          className="mt-1"
          data-testid="activation-choose-date"
        />
        <span>Choose a later date</span>
      </label>
      {mode === "choose_date" ? (
        <label className="block text-xs font-medium text-zinc-700">
          Effective date
          <input
            type="date"
            name="effectiveFrom"
            min={minDateKey}
            defaultValue={nextDayKey}
            required
            className={inputClass}
            data-testid="activation-choose-date-input"
          />
        </label>
      ) : (
        <input
          type="hidden"
          name="effectiveFrom"
          value={mode === "immediate" ? todayKey : nextDayKey}
        />
      )}
    </div>
  );
}

export function AddCycleToggle({
  children,
  defaultOpen = false,
  title = "Add operational cycle",
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    function onHash() {
      if (typeof window !== "undefined" && window.location.hash === "#create-cycle") {
        setOpen(true);
      }
    }
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function close() {
    setOpen(false);
    if (typeof window !== "undefined" && window.location.hash === "#create-cycle") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          data-testid="add-operational-cycle"
          className="inline-flex rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
          onClick={() => {
            setOpen(true);
            if (typeof window !== "undefined") {
              window.location.hash = "create-cycle";
            }
          }}
        >
          + Add operational cycle
        </button>
      </div>
      <Drawer open={open} onClose={close} title={title} closeLabel="Cancel">
        <DepartmentAdminFormCloseContext.Provider value={close}>
          <div id="create-cycle" className="space-y-3">
            <p className="text-xs text-zinc-500">
              Create a major operating period. Changes start as Draft.
            </p>
            {children}
          </div>
        </DepartmentAdminFormCloseContext.Provider>
      </Drawer>
    </div>
  );
}

export type CycleRowData = {
  id: string;
  label: string;
  nodeKind: "PERIOD" | "KEY_TIME";
  startLocal: string | null;
  endLocal: string | null;
  mealType: string | null;
  applicableDaysOfWeek: number[];
  description: string | null;
  cycleType: string;
  displaySequence: number;
  overnight: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  locationMode: string;
  locationInheritFromParent: boolean;
  applicableUnitTypes: string[];
  applicableOperationalTypeKeys: string[];
  expectedMilestones: string[];
  roomTypeKey: string | null;
  unitIds: string[];
  spaceIds: string[];
  keyTimeGroups: Array<{ dueLocal: string; spaceIds: string[] }>;
  milestoneTimes: Array<{ unitId: string; milestone: string; configuredTime: string }>;
  status: "DRAFT" | "PUBLISHED" | "RETIRED";
  stableKey: string;
  parentStableKey: string | null;
};

export type CycleEditorCatalog = {
  locations: CycleScopeLocationOption[];
  roomTypes: StandardRoomTypeOption[];
  operationalTypes?: Array<{ key: string; name: string }>;
};

function normalizeTimeInput(value: string | null | undefined): string {
  if (!value) return "";
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return value;
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

export type ParentCycleOption = {
  stableKey: string;
  label: string;
  displayPath: string;
  depth?: number;
};

function formatMealTitle(meal: string | null | undefined): string {
  if (!meal) return "Meal";
  return meal.charAt(0) + meal.slice(1).toLowerCase();
}

export function CycleEditorFields({
  idPrefix,
  defaults,
  showMeal,
  compactCreate = false,
  catalog,
  parentOptions = [],
  inheritedMealType = null,
  namePlaceholder,
}: {
  idPrefix: string;
  defaults: Partial<CycleRowData> & {
    applicableDaysOfWeek?: number[];
    applicableUnitTypes?: string[];
    applicableOperationalTypeKeys?: string[];
    expectedMilestones?: string[];
    roomTypeKey?: string | null;
    unitIds?: string[];
    spaceIds?: string[];
    keyTimeGroups?: Array<{ dueLocal: string; spaceIds: string[] }>;
    milestoneTimes?: Array<{ unitId: string; milestone: string; configuredTime: string }>;
    parentStableKey?: string | null;
    stableKey?: string;
    nodeKind?: "PERIOD" | "KEY_TIME";
    locationInheritFromParent?: boolean;
  };
  showMeal: boolean;
  compactCreate?: boolean;
  catalog?: CycleEditorCatalog;
  parentOptions?: ParentCycleOption[];
  /** Meal context inherited from parent when this draft leaves Meal blank. */
  inheritedMealType?: string | null;
  namePlaceholder?: string;
}) {
  const days = defaults.applicableDaysOfWeek ?? [0, 1, 2, 3, 4, 5, 6];
  const nodeKind = defaults.nodeKind ?? "PERIOD";
  const [parentStableKey, setParentStableKey] = useState(defaults.parentStableKey ?? "");
  const isNested = Boolean(parentStableKey);
  /** Key Times always need a parent; nested phases should not casually detach to top-level. */
  const requireParent =
    nodeKind === "KEY_TIME" ||
    Boolean(defaults.parentStableKey) ||
    compactCreate ||
    // Detached after accidental clear while still marked as inheriting — force re-attach.
    (Boolean(defaults.locationInheritFromParent) && !defaults.parentStableKey);
  const [locationInheritFromParent, setLocationInheritFromParent] = useState(
    defaults.locationInheritFromParent ?? false,
  );

  function onParentChange(next: string) {
    setParentStableKey(next);
    if (!next) {
      // Top-level cannot inherit locations.
      setLocationInheritFromParent(false);
    }
  }
  const [keyTimeGroups, setKeyTimeGroups] = useState(
    () =>
      defaults.keyTimeGroups && defaults.keyTimeGroups.length > 0
        ? defaults.keyTimeGroups
        : defaults.nodeKind === "KEY_TIME"
          ? [{ dueLocal: "", spaceIds: [] as string[] }]
          : [],
  );
  const [showLegacyMilestones, setShowLegacyMilestones] = useState(false);
  const hasLegacyMilestoneData =
    (defaults.milestoneTimes ?? []).some((row) => row.milestone === "SERVICE_STARTED") ||
    defaults.locationMode === "ROOM_TYPE" ||
    (defaults.expectedMilestones ?? []).includes("SERVICE_STARTED");
  const [appliesTo, setAppliesTo] = useState<CycleUserScope>(() =>
    userFacingScopeFromMode(
      (defaults.locationMode as
        | "ALL_DEPARTMENT_UNITS"
        | "UNIT_TYPES"
        | "EXPLICIT_UNITS"
        | "ROOM_TYPE"
        | "OPERATIONAL_TYPES") ?? "OPERATIONAL_TYPES",
    ),
  );
  const [roomTypeKey, setRoomTypeKey] = useState(defaults.roomTypeKey ?? "servery");
  const [unitIds, setUnitIds] = useState<string[]>(defaults.unitIds ?? []);
  const [spaceIds, setSpaceIds] = useState<string[]>(defaults.spaceIds ?? []);
  const [operationalTypeKeys, setOperationalTypeKeys] = useState<string[]>(
    defaults.applicableOperationalTypeKeys ?? [],
  );
  const [cycleType, setCycleType] = useState(defaults.cycleType ?? "SERVICE");
  const [mealType, setMealType] = useState(
    defaults.mealType ?? (showMeal && !inheritedMealType ? "BREAKFAST" : defaults.mealType ?? ""),
  );
  const [milestones, setMilestones] = useState<string[]>(
    defaults.expectedMilestones ?? (showMeal ? ["READY", "SERVICE_STARTED"] : []),
  );
  const [times, setTimes] = useState<Record<string, string>>(() => {
    const next: Record<string, string> = {};
    for (const row of defaults.milestoneTimes ?? []) {
      if (row.milestone === "SERVICE_STARTED") next[row.unitId] = row.configuredTime;
    }
    return next;
  });
  const [setAll, setSetAll] = useState("");

  const locationMode = locationInheritFromParent
    ? "EXPLICIT_UNITS"
    : locationModeFromUserScope(appliesTo);
  const locations = catalog?.locations ?? [];
  const roomTypes = catalog?.roomTypes ?? [];
  const operationalTypes = catalog?.operationalTypes ?? [];
  const [roomTypeFilterId, setRoomTypeFilterId] = useState("");
  const neighborhoods = locations.filter((row) => row.kind === "neighborhood");
  const rooms = locations.filter((row) => row.kind === "room");
  const effectiveMeal = mealType || inheritedMealType || null;
  const showLegacyServiceBlock =
    showMeal &&
    hasLegacyMilestoneData &&
    nodeKind === "PERIOD" &&
    (showLegacyMilestones || (defaults.milestoneTimes ?? []).length > 0);
  const showTimes =
    showLegacyServiceBlock &&
    shouldShowServiceStartTimes({
      cycleType,
      mealType: effectiveMeal,
      expectedMilestones: milestones,
    });
  const candidates = showTimes
    ? mealTimeNeighborhoodCandidates({
        locationMode,
        roomTypeKey: appliesTo === "room_type" ? roomTypeKey : null,
        unitIds,
        spaceIds,
        locations,
      })
    : [];
  const mealTitle = formatMealTitle(effectiveMeal);
  const serverySelected = appliesTo === "room_type" && roomTypeKey === "servery";

  function toggleMilestone(value: string, on: boolean) {
    setMilestones((prev) => {
      if (on) return prev.includes(value) ? prev : [...prev, value];
      return prev.filter((item) => item !== value);
    });
  }

  function applySetAll() {
    if (!setAll.trim()) return;
    const next = { ...times };
    for (const row of candidates) next[row.unitId] = setAll;
    setTimes(next);
  }

  function emptyTimesMessage(): string {
    if (appliesTo === "room_type" && roomTypeKey === "servery") {
      return "No Servery rooms with Neighborhood parents are assigned to this department yet.";
    }
    if (appliesTo === "room_type") {
      return "No matching rooms found for this Room Type in the department.";
    }
    if (appliesTo === "specific") {
      return "Select Neighborhood locations (or rooms under them) to configure start times.";
    }
    return "Choose Room Type → Servery (or Neighborhood locations) to configure start times.";
  }

  return (
    <div className="space-y-4">
      <input type="hidden" name="nodeKind" value={nodeKind} />
      <input
        type="hidden"
        name="locationInheritFromParent"
        value={locationInheritFromParent ? "true" : "false"}
      />
      <div className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          {nodeKind === "KEY_TIME" ? "Key Time" : isNested ? "Phase" : "Operational cycle"} basics
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-zinc-700 sm:col-span-2">
            Name
            <input
              id={`${idPrefix}-label`}
              name="label"
              required
              defaultValue={defaults.label ?? ""}
              placeholder={
                namePlaceholder ??
                (nodeKind === "KEY_TIME" ? "e.g. Breakfast Due" : "e.g. Breakfast")
              }
              className={inputClass}
            />
          </label>
          {nodeKind === "KEY_TIME" && parentStableKey ? (
            <div className="sm:col-span-2 space-y-1">
              <input type="hidden" name="parentStableKey" value={parentStableKey} />
              <p className="text-xs font-medium text-zinc-700">Part of</p>
              <p className="text-sm text-zinc-900">
                {parentOptions.find((option) => option.stableKey === parentStableKey)?.displayPath ??
                  "its Operational Cycle"}
              </p>
              <p className="text-[11px] text-zinc-500">
                A Key Time is a due-time checkpoint inside an Operational Cycle. It does not have its
                own start and end window, so it has to stay under Lunch, Breakfast, or another
                cycle.
              </p>
            </div>
          ) : parentOptions.length > 0 || defaults.parentStableKey || requireParent ? (
            <label className="block text-xs font-medium text-zinc-700 sm:col-span-2">
              Part of
              <select
                name="parentStableKey"
                value={parentStableKey}
                onChange={(event) => onParentChange(event.target.value)}
                className={inputClass}
                data-testid="cycle-parent"
                required={requireParent}
              >
                {requireParent ? null : (
                  <option value="">None — top-level Operational Cycle</option>
                )}
                {requireParent && !parentStableKey ? (
                  <option value="" disabled>
                    Choose an Operational Cycle…
                  </option>
                ) : null}
                {parentOptions.map((option) => (
                  <option key={option.stableKey} value={option.stableKey}>
                    {option.displayPath}
                  </option>
                ))}
              </select>
              {requireParent ? (
                <span className="mt-1 block text-[11px] font-normal text-zinc-500">
                  {nodeKind === "KEY_TIME"
                    ? "Key Times must stay under an Operational Cycle."
                    : "Phases belong under an Operational Cycle. Drag in the tree to move between cycles."}
                </span>
              ) : null}
            </label>
          ) : (
            <input type="hidden" name="parentStableKey" value={parentStableKey} />
          )}
          {nodeKind === "PERIOD" ? (
            <>
              <label className="block text-xs font-medium text-zinc-700">
                Start time
                <input
                  name="startLocal"
                  required
                  type="time"
                  defaultValue={normalizeTimeInput(defaults.startLocal)}
                  className={inputClass}
                />
              </label>
              <label className="block text-xs font-medium text-zinc-700">
                End time
                <input
                  name="endLocal"
                  required
                  type="time"
                  defaultValue={normalizeTimeInput(defaults.endLocal)}
                  className={inputClass}
                />
              </label>
            </>
          ) : (
            <>
              <input type="hidden" name="startLocal" value="" />
              <input type="hidden" name="endLocal" value="" />
            </>
          )}
          <DayOfWeekPicker defaultDays={days} />
        </div>
      </div>

      <div className="space-y-3">
        {nodeKind === "KEY_TIME" ? (
          <div className="space-y-2" data-testid="cycle-scope">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Due times
            </p>
            <p className="text-xs text-zinc-600">
              Set when this key time is due for each group of rooms. Each room can appear in only one
              group.
            </p>
            <input type="hidden" name="mealType" value="" />
            <KeyTimeGroupsEditor
              locations={locations}
              groups={keyTimeGroups}
              onChange={setKeyTimeGroups}
              roomTypes={roomTypes}
            />
          </div>
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Context
            </p>
            {showMeal ? (
              <label className="block text-xs font-medium text-zinc-700">
                Meal
                <select
                  name="mealType"
                  value={mealType}
                  onChange={(event) => setMealType(event.target.value)}
                  className={inputClass}
                >
                  <option value="">
                    {inheritedMealType
                      ? `Use parent (${formatMealTitle(inheritedMealType)})`
                      : "None"}
                  </option>
                  <option value="BREAKFAST">Breakfast</option>
                  <option value="LUNCH">Lunch</option>
                  <option value="DINNER">Dinner</option>
                </select>
              </label>
            ) : (
              <input type="hidden" name="mealType" value="" />
            )}

            <fieldset className="space-y-2" data-testid="cycle-scope">
              <legend className="text-xs font-medium text-zinc-700">Locations</legend>
              {isNested ? (
                <div className="space-y-1">
                  <label className="flex items-center gap-2 text-sm text-zinc-800">
                    <input
                      type="radio"
                      name="locationInheritChoice"
                      checked={locationInheritFromParent}
                      onChange={() => setLocationInheritFromParent(true)}
                    />
                    Use parent locations
                  </label>
                  <label className="flex items-center gap-2 text-sm text-zinc-800">
                    <input
                      type="radio"
                      name="locationInheritChoice"
                      checked={!locationInheritFromParent}
                      onChange={() => setLocationInheritFromParent(false)}
                    />
                    Choose different rooms
                  </label>
                </div>
              ) : null}
              {!locationInheritFromParent ? (
                <>
                  <div className="space-y-1">
                    <label className="flex items-center gap-2 text-sm text-zinc-800">
                      <input
                        type="radio"
                        name="appliesTo"
                        value="operational_types"
                        checked={appliesTo === "operational_types"}
                        onChange={() => setAppliesTo("operational_types")}
                        data-testid="cycle-applies-operational-types"
                      />
                      Operational Types
                    </label>
                    <label className="flex items-center gap-2 text-sm text-zinc-800">
                      <input
                        type="radio"
                        name="appliesTo"
                        value="specific"
                        checked={appliesTo === "specific"}
                        onChange={() => setAppliesTo("specific")}
                        data-testid="cycle-applies-specific"
                      />
                      Specific rooms
                    </label>
                  </div>
                  {appliesTo === "operational_types" ? (
                    <div className="space-y-2" data-testid="cycle-operational-types">
                      <p className="text-[11px] text-zinc-500">
                        Apply this cycle to every room currently assigned these Operational Types.
                        This is not Physical Room Type.
                      </p>
                      {operationalTypes.length === 0 ? (
                        <p className="text-xs text-zinc-500" data-testid="cycle-operational-types-empty">
                          No Operational Types yet. Create them in Department Locations, then return
                          here.
                        </p>
                      ) : (
                        <div className="space-y-1 rounded-md border border-zinc-200 bg-white p-2">
                          {operationalTypes.map((type) => (
                            <label
                              key={type.key}
                              className="flex items-center gap-2 text-sm text-zinc-800"
                            >
                              <input
                                type="checkbox"
                                checked={operationalTypeKeys.includes(type.key)}
                                onChange={(event) => {
                                  setOperationalTypeKeys((prev) =>
                                    event.target.checked
                                      ? [...prev, type.key]
                                      : prev.filter((key) => key !== type.key),
                                  );
                                }}
                                data-testid={`cycle-operational-type-${type.key}`}
                              />
                              {type.name}
                            </label>
                          ))}
                        </div>
                      )}
                      <input
                        type="hidden"
                        name="applicableOperationalTypeKeys"
                        value={operationalTypeKeys.join(",")}
                      />
                    </div>
                  ) : (
                    <input type="hidden" name="applicableOperationalTypeKeys" value="" />
                  )}
                  {appliesTo === "specific" ? (
                    <>
                      <p className="text-[11px] text-zinc-500">
                        Assign this cycle to specific rooms. Physical Room Type filters help select
                        many rooms at once — membership stays explicit.
                      </p>
                      {roomTypes.length > 0 ? (
                        <label className="block text-xs font-medium text-zinc-700">
                          Filter by Physical Room Type
                          <select
                            value={roomTypeFilterId}
                            onChange={(event) => setRoomTypeFilterId(event.target.value)}
                            className={inputClass}
                            data-testid="cycle-room-type-filter"
                          >
                            <option value="">All rooms</option>
                            {roomTypes.map((option) => (
                              <option key={option.key} value={option.key}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <RoomPicker
                        locations={locations}
                        selectedIds={spaceIds}
                        onChange={setSpaceIds}
                        name="spaceIds"
                        filter={
                          roomTypeFilterId
                            ? { facilityRoomTypeId: roomTypeFilterId }
                            : undefined
                        }
                      />
                    </>
                  ) : null}
                  <details className="rounded-md border border-zinc-200 bg-zinc-50 p-2">
                    <summary className="cursor-pointer text-xs font-medium text-zinc-700">
                      Legacy location scope
                    </summary>
                    <div className="mt-2 space-y-2">
                      {(
                        [
                          ["department", "Entire department"],
                          ["room_type", "Physical Room Type"],
                          ["specific", "Specific neighborhoods"],
                        ] as const
                      ).map(([value, label]) => (
                        <label
                          key={value}
                          className="flex items-center gap-2 text-sm text-zinc-800"
                        >
                          <input
                            type="radio"
                            name="appliesTo"
                            value={value}
                            checked={appliesTo === value}
                            onChange={() => setAppliesTo(value)}
                          />
                          {label}
                        </label>
                      ))}
                      {appliesTo === "room_type" ? (
                        <label className="block text-xs font-medium text-zinc-700">
                          Physical Room Type
                          <select
                            name="roomTypeKey"
                            value={roomTypeKey}
                            onChange={(event) => setRoomTypeKey(event.target.value)}
                            className={inputClass}
                            data-testid="cycle-room-type"
                          >
                            {roomTypes.map((option) => (
                              <option key={option.key} value={option.key}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <input type="hidden" name="roomTypeKey" value="" />
                      )}
                      {appliesTo === "specific" ? (
                        <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-zinc-200 bg-white p-2">
                          {neighborhoods.map((neighborhood) => (
                            <label
                              key={neighborhood.id}
                              className="flex items-center gap-2 text-sm text-zinc-800"
                            >
                              <input
                                type="checkbox"
                                checked={unitIds.includes(neighborhood.id)}
                                onChange={(event) => {
                                  setUnitIds((prev) =>
                                    event.target.checked
                                      ? [...prev, neighborhood.id]
                                      : prev.filter((id) => id !== neighborhood.id),
                                  );
                                }}
                              />
                              {neighborhood.name}
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </details>
                </>
              ) : (
                <p className="text-xs text-zinc-600">
                  Rooms resolve from the parent phase when published.
                </p>
              )}
            </fieldset>
          </>
        )}
      </div>

      {nodeKind === "KEY_TIME" ? null : showMeal && hasLegacyMilestoneData ? (
        <details className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-600">
            Legacy meal milestones
          </summary>
          <div className="mt-3 space-y-3">
            <fieldset className="space-y-1">
              <legend className="text-xs font-medium text-zinc-700">Expected milestones</legend>
              <label className="flex items-center gap-2 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  checked={milestones.includes("READY")}
                  onChange={(event) => toggleMilestone("READY", event.target.checked)}
                />
                Ready
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  checked={milestones.includes("SERVICE_STARTED")}
                  onChange={(event) => toggleMilestone("SERVICE_STARTED", event.target.checked)}
                />
                Meal Service Started
              </label>
            </fieldset>

            {showTimes ? (
              <div className="space-y-2" data-testid="meal-service-start-times">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">
                    {mealTitle} service start times
                  </p>
                  <p className="text-xs text-zinc-500">
                    Legacy Run compatibility — prefer Key Time groups for new Build work.
                  </p>
                </div>
                {candidates.length === 0 ? (
                  <p className="text-xs text-zinc-500" data-testid="meal-times-empty">
                    {emptyTimesMessage()}
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="text-xs text-zinc-600">
                        Set all to
                        <input
                          type="time"
                          value={setAll}
                          onChange={(event) => setSetAll(event.target.value)}
                          className={inputClass}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={applySetAll}
                        className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                      >
                        Apply
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[280px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-zinc-200 text-xs text-zinc-500">
                            <th className="py-1.5 pr-3 font-medium">Neighborhood</th>
                            <th className="py-1.5 font-medium">Start time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {candidates.map((row) => (
                            <tr key={row.unitId} className="border-b border-zinc-100">
                              <td className="py-1.5 pr-3 text-zinc-800">{row.name}</td>
                              <td className="py-1.5">
                                <input
                                  type="time"
                                  value={times[row.unitId] ?? ""}
                                  onChange={(event) =>
                                    setTimes((prev) => ({
                                      ...prev,
                                      [row.unitId]: event.target.value,
                                    }))
                                  }
                                  className="rounded-md border border-zinc-300 px-2 py-1 text-sm"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                <input
                  type="hidden"
                  name="serviceStartTimes"
                  value={JSON.stringify(
                    Object.entries(times)
                      .filter(([, value]) => value.trim())
                      .map(([unitId, configuredTime]) => ({
                        unitId,
                        milestone: "SERVICE_STARTED",
                        configuredTime,
                      })),
                  )}
                />
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      <input type="hidden" name="expectedMilestones" value={milestones.join(",")} />
      <input type="hidden" name="unitIds" value={unitIds.join(",")} />
      {locationInheritFromParent ? null : (
        <input type="hidden" name="spaceIds" value={spaceIds.join(",")} />
      )}
      <input type="hidden" name="cycleType" value={cycleType} />
      {!compactCreate ? (
        <label className="block text-xs font-medium text-zinc-700">
          Type
          <select
            value={cycleType}
            onChange={(event) => setCycleType(event.target.value)}
            className={inputClass}
          >
            <option value="PREPARATION">Preparation</option>
            <option value="SERVICE">Service</option>
            <option value="TRANSITION">Transition</option>
            <option value="CLOSEOUT">Closeout</option>
            <option value="CUSTOM">Custom</option>
          </select>
        </label>
      ) : null}
      {defaults.effectiveFrom ? (
        <input type="hidden" name="effectiveFrom" value={defaults.effectiveFrom} />
      ) : null}
      {defaults.displaySequence != null ? (
        <input type="hidden" name="displaySequence" value={String(defaults.displaySequence)} />
      ) : null}
    </div>
  );
}
