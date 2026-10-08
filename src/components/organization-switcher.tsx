import { switchOrganizationAction } from "@/app/(organization-account)/organization/actions";

export function OrganizationSwitcher({
  currentOrganizationId,
  options,
}: {
  currentOrganizationId: string;
  options: Array<{ organizationId: string; label: string }>;
}) {
  return (
    <form action={switchOrganizationAction} className="flex items-center gap-2">
      <label className="text-xs font-medium text-zinc-600" htmlFor="organization-switcher">
        Organization
      </label>
      <select
        id="organization-switcher"
        name="organizationId"
        defaultValue={currentOrganizationId}
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
      >
        {options.map((option) => (
          <option key={option.organizationId} value={option.organizationId}>
            {option.label}
          </option>
        ))}
      </select>
      <button type="submit" className="text-sm font-medium underline underline-offset-2">
        Switch
      </button>
    </form>
  );
}
