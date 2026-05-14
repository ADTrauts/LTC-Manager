import { redirect } from "next/navigation";

import { hasAtLeastRole } from "@/lib/access";
import { getSession } from "@/lib/auth";

import { ImportCsvForm } from "./import-csv-form";

export default async function EmployeesImportPage() {
  const session = await getSession();
  if (!session?.facilityId) {
    redirect("/login");
  }
  if (!hasAtLeastRole(session.role, "MANAGER")) {
    redirect("/dashboard");
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Import employees (CSV)</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Bulk-create or update roster fields from a comma-separated file. PINs and per-card edits stay in the
          Employees directory.
        </p>
      </header>

      <ImportCsvForm />

      <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4 text-xs text-zinc-600">
        <p className="font-medium text-zinc-800">Columns (headers are case-insensitive)</p>
        <p className="mt-2">
          Required: <span className="font-mono">firstName</span>, <span className="font-mono">lastName</span>.
          Optional: <span className="font-mono">email</span>, <span className="font-mono">phone</span>,{" "}
          <span className="font-mono">roleType</span> (defaults STAFF), <span className="font-mono">employmentType</span>{" "}
          (FULL_TIME), <span className="font-mono">status</span> (ACTIVE), <span className="font-mono">unionMember</span>,{" "}
          <span className="font-mono">onLeave</span>, <span className="font-mono">hireDate</span> (YYYY-MM-DD),{" "}
          <span className="font-mono">jobClassification</span>, <span className="font-mono">chrcStatus</span>,{" "}
          <span className="font-mono">chrcClearedAt</span>, <span className="font-mono">chrcNotes</span>,{" "}
          <span className="font-mono">birthMonth</span>, <span className="font-mono">birthDay</span>,{" "}
          <span className="font-mono">shirtSize</span> (XS, S, M, L, XL, 2XL–5XL),{" "}
          <span className="font-mono">hrNotes</span>,{" "}
          <span className="font-mono">workStations</span> (e.g. COOK|SERVER), <span className="font-mono">primaryUnit</span>{" "}
          (unit name), <span className="font-mono">terminationDate</span>,{" "}
          <span className="font-mono">chrcOffboardingCompletedAt</span>,{" "}
          <span className="font-mono">chrcOffboardingNotes</span>.
        </p>
      </div>
    </section>
  );
}
