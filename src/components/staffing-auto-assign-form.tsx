"use client";

import { useFormStatus } from "react-dom";
import { ShiftType } from "@prisma/client";

type EmployeeOption = {
  id: string;
  firstName: string;
  lastName: string;
};

type StaffingAutoAssignFormProps = {
  action: (formData: FormData) => Promise<void>;
  unitId: string;
  dateIso: string;
  employees: EmployeeOption[];
  fixedShift?: ShiftType;
  defaultShift?: ShiftType;
  compact?: boolean;
};

function AssigningLabel() {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return <span className="text-xs text-zinc-500">Assigning...</span>;
}

export function StaffingAutoAssignForm({
  action,
  unitId,
  dateIso,
  employees,
  fixedShift,
  defaultShift = ShiftType.FULL_DAY,
  compact = false,
}: StaffingAutoAssignFormProps) {
  return (
    <form action={action} className={compact ? "space-y-2" : "mt-2 flex flex-wrap items-center gap-2"}>
      <input type="hidden" name="unitId" value={unitId} />
      <input type="hidden" name="date" value={dateIso} />
      {fixedShift ? <input type="hidden" name="shift" value={fixedShift} /> : null}
      {!fixedShift ? (
        <select name="shift" defaultValue={defaultShift} className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
          {Object.values(ShiftType).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      ) : null}
      <select
        name="employeeId"
        required
        defaultValue=""
        onChange={(event) => {
          if (event.currentTarget.value) {
            event.currentTarget.form?.requestSubmit();
          }
        }}
        className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
      >
        <option value="">Select employee</option>
        {employees.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.firstName} {employee.lastName}
          </option>
        ))}
      </select>
      <AssigningLabel />
    </form>
  );
}
