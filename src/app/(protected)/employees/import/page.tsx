import Link from "next/link";
import { redirect } from "next/navigation";
import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { EMPLOYEE_CLEARABLE_FIELDS } from "@/lib/employee-csv-import";
import { requireEmployeeCsvAuthority } from "@/lib/employee-csv-update/service";
import { resolveWorkspaceHomeHref } from "@/lib/shell/workspace-home";
import { ImportCsvForm } from "./import-csv-form";

export default async function EmployeesImportPage() {
  const session = await getSession();
  if (!session?.facilityId) redirect("/login");
  if (!hasAtLeastRole(session.role, "MANAGER")) redirect(resolveWorkspaceHomeHref(session));
  let denied: string | null = null;
  try { requireEmployeeCsvAuthority(session); }
  catch (error) { denied = (error as Error).message; }
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Update employees (CSV)</h1>
        <p className="mt-2 text-sm text-zinc-600">Update existing Facility roster fields after reviewing exact changes. Add new employees from Add employee. Role, status, separation, account linking, and PIN changes use the existing employee actions.</p>
      </header>
      <Link className="inline-block underline" href="/employees/bulk-setup">Create/reuse workforce or add relationships with the separate reviewed CSV workflow</Link>
      {denied ? <p role="alert">{denied}</p> : <ImportCsvForm />}
      <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
        <h2 className="font-semibold">File rules</h2>
        <p>Omitted columns and blank cells preserve data. Use <code>__CLEAR__</code> for a deliberate clear in these fields only: {[...EMPLOYEE_CLEARABLE_FIELDS].join(", ")}. Domain restrictions still apply; email required by a leadership role cannot be cleared.</p>
        <p>Match by an exported Employee ID, otherwise a unique email. Without either, both names must uniquely match one employee in this Facility. Use Employee ID when changing email or names. An email matching another person blocks the row; an unmatched email never falls back to names.</p>
        <p>Headers are case-insensitive. Dates use YYYY-MM-DD. Booleans use true/false (yes/no and 1/0 also work). Workstations use names separated by |. Birth month/day must form a valid pair, or both be explicitly cleared. The template has a header only.</p>
        <p>Duplicate target employees, malformed rows, unsupported columns, authority and lifecycle changes are blocked. Publication, access grants, global accounts and employment history are outside this update.</p>
      </div>
    </section>
  );
}
