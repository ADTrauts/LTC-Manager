"use client";

import { usePathname } from "next/navigation";

import { switchPartnerDepartmentAction } from "@/app/partner/actions";
import type { PartnerDepartmentChoice } from "@/lib/partner-operational-context";

export function PartnerDepartmentSwitch({
  departments,
  activeDepartmentId,
}: {
  departments: readonly PartnerDepartmentChoice[];
  activeDepartmentId: string;
}) {
  const pathname = usePathname();
  const returnTo = pathname.startsWith("/partner/logs")
    ? "/partner/logs"
    : pathname.startsWith("/partner/reports")
      ? "/partner/reports"
      : pathname.startsWith("/partner/locations")
        ? "/partner/locations"
        : pathname.startsWith("/partner/assets")
          ? "/partner/assets"
          : "/partner";

  return (
    <form action={switchPartnerDepartmentAction} className="mt-2 space-y-2">
      <input type="hidden" name="returnTo" value={returnTo} />
      <label className="block">
        <span className="sr-only">Active department</span>
        <select
          name="departmentId"
          defaultValue={activeDepartmentId}
          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5"
        >
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white">
        Switch
      </button>
    </form>
  );
}
