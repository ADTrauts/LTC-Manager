import Link from "next/link";

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900">Admin</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Facility configuration, lookup values, and other system settings. General Managers only.
        </p>
      </header>
      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white shadow-sm">
        <li>
          <Link
            href="/admin/permissions"
            className="flex flex-col gap-0.5 px-4 py-4 transition hover:bg-zinc-50 sm:px-6"
          >
            <span className="text-sm font-medium text-zinc-900">Permissions</span>
            <span className="text-sm text-zinc-600">
              Manage jobs and route-level access so permissions are not hard-coded.
            </span>
          </Link>
        </li>
        <li>
          <Link
            href="/admin/organization"
            className="flex flex-col gap-0.5 px-4 py-4 transition hover:bg-zinc-50 sm:px-6"
          >
            <span className="text-sm font-medium text-zinc-900">Organization</span>
            <span className="text-sm text-zinc-600">
              Facility name, management company, union handbook PDF, and device binding for PIN sign-in.
            </span>
          </Link>
        </li>
        <li className="px-4 py-4 text-sm text-zinc-500 sm:px-6">
          Additional admin tools (categories, lookups) will appear here in later phases.
        </li>
      </ul>
    </div>
  );
}
