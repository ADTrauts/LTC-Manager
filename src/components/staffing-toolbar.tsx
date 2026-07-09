"use client";

import { MealType, RoleKey, ShiftType } from "@prisma/client";
import { useState } from "react";

import { createOverrideAction, createScheduleEntryAction } from "@/app/(protected)/staffing/actions";
import { Drawer } from "@/components/drawer";
import { CALL_DOWN_REASON_TEMPLATES } from "@/lib/todays-work/call-down";

type EmployeeOption = { id: string; firstName: string; lastName: string; roleType: RoleKey };
type UnitOption = { id: string; name: string };
type ScheduleOption = {
  id: string;
  employee: { firstName: string; lastName: string };
  unit: { name: string };
};

type StaffingToolbarProps = {
  employees: EmployeeOption[];
  units: UnitOption[];
  schedules: ScheduleOption[];
  todayIso: string;
};

export function StaffingToolbar({ employees, units, schedules, todayIso }: StaffingToolbarProps) {
  const [shiftOpen, setShiftOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [reasonTemplate, setReasonTemplate] = useState("");

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => setShiftOpen(true)}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Add shift
      </button>
      <button
        type="button"
        onClick={() => setOverrideOpen(true)}
        className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
      >
        Log call-down / override
      </button>

      <Drawer open={shiftOpen} onClose={() => setShiftOpen(false)} title="Add shift">
        <form
          action={async (formData) => {
            await createScheduleEntryAction(formData);
            setShiftOpen(false);
          }}
          className="grid gap-3 md:grid-cols-2"
        >
          <select name="employeeId" required className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
            <option value="">Select employee</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.firstName} {employee.lastName}
              </option>
            ))}
          </select>
          <select name="unitId" required className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
            <option value="">Select unit</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            name="date"
            defaultValue={todayIso}
            required
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <select name="shift" defaultValue={ShiftType.FULL_DAY} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
            {Object.values(ShiftType).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select name="roleType" defaultValue={RoleKey.STAFF} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
            {Object.values(RoleKey).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <input name="plannedStart" placeholder="Start (HH:MM)" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          <input name="plannedEnd" placeholder="End (HH:MM)" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          <div className="md:col-span-2">
            <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
              Add schedule entry
            </button>
          </div>
        </form>
      </Drawer>

      <Drawer
        open={overrideOpen}
        onClose={() => {
          setOverrideOpen(false);
          setReasonTemplate("");
        }}
        title="Log call-down / override"
      >
        <form
          action={async (formData) => {
            await createOverrideAction(formData);
            setOverrideOpen(false);
            setReasonTemplate("");
          }}
          className="grid gap-3 md:grid-cols-2"
        >
          <select name="scheduleEntryId" className="md:col-span-2 rounded-md border border-zinc-300 px-3 py-2 text-sm">
            <option value="">No linked schedule entry</option>
            {schedules.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.employee.firstName} {entry.employee.lastName} · {entry.unit.name}
              </option>
            ))}
          </select>
          <select name="employeeId" required className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
            <option value="">Select employee</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.firstName} {employee.lastName}
              </option>
            ))}
          </select>
          <select name="oldUnitId" className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
            <option value="">Old unit (optional)</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
          <select name="newUnitId" required className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
            <option value="">New unit</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            name="date"
            defaultValue={todayIso}
            required
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <select name="mealType" defaultValue="" className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
            <option value="">Any meal</option>
            {Object.values(MealType).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            name="reasonTemplate"
            value={reasonTemplate}
            onChange={(event) => setReasonTemplate(event.target.value)}
            className="md:col-span-2 rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">Free-text reason</option>
            {CALL_DOWN_REASON_TEMPLATES.map((template) => (
              <option key={template.key} value={template.key}>
                {template.label}
              </option>
            ))}
          </select>
          <input
            name="reasonDetails"
            placeholder={reasonTemplate ? "Optional details" : "Reason (required for free-text)"}
            required={!reasonTemplate}
            className="md:col-span-2 rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <p className="md:col-span-2 text-xs text-zinc-500">
            Use a call-down template for coverage risks, or leave the template blank and enter a free-text reason.
          </p>
          <div className="md:col-span-2">
            <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
              Save override
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
