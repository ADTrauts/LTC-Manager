"use client";

type UnitOption = { id: string; name: string };

type EmployeeUnitAccessFieldsProps = {
  units: UnitOption[];
  defaultMode?: "all" | "restricted";
  defaultAllowedIds?: Set<string>;
  defaultPrimaryId?: string | null;
};

export function EmployeeUnitAccessFields({
  units,
  defaultMode = "all",
  defaultAllowedIds,
  defaultPrimaryId,
}: EmployeeUnitAccessFieldsProps) {
  const allowed = defaultAllowedIds ?? new Set<string>();

  return (
    <div className="min-w-0 sm:col-span-2 space-y-3 border-t border-zinc-200 pt-4">
      <p className="text-sm font-medium text-zinc-800">Unit access (floor / PIN)</p>
      <p className="text-xs text-zinc-500">
        Limits which units appear in the sidebar for this person when they use PIN sign-in. Managers using email always see all units.
      </p>
      <div>
        <label htmlFor="unitAccessMode" className="block text-xs font-medium text-zinc-700">
          Unit list
        </label>
        <select
          id="unitAccessMode"
          name="unitAccessMode"
          defaultValue={defaultMode}
          className="mt-1 w-full max-w-md rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="all">All active units at this facility</option>
          <option value="restricted">Selected units only</option>
        </select>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-zinc-700">Allowed units (when restricted)</legend>
        <div className="flex flex-wrap gap-3">
          {units.map((unit) => (
            <label key={unit.id} className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                name="allowedUnitIds"
                value={unit.id}
                defaultChecked={allowed.has(unit.id)}
              />
              {unit.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="primaryUnitId" className="block text-xs font-medium text-zinc-700">
          Primary unit (optional)
        </label>
        <p className="text-xs text-zinc-500">Default focus when signing in with PIN; must be included when access is restricted.</p>
        <select
          id="primaryUnitId"
          name="primaryUnitId"
          defaultValue={defaultPrimaryId ?? ""}
          className="mt-1 w-full max-w-md rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">— None —</option>
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
