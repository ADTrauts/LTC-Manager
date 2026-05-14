"use client";

import { DisciplinePointCategory } from "@prisma/client";

import {
  addDisciplinePointEntryAction,
  deleteDisciplinePointEntryAction,
} from "@/app/(protected)/employees/actions";

const CATEGORY_LABEL: Record<DisciplinePointCategory, string> = {
  ATTENDANCE: "Attendance",
  PERFORMANCE: "Performance",
};

export type DisciplineEntryForCard = {
  id: string;
  category: DisciplinePointCategory;
  points: number;
  occurredAtIso: string;
  note: string | null;
};

type EmployeeDisciplineSectionProps = {
  employeeId: string;
  entries: DisciplineEntryForCard[];
  totals: { attendance: number; performance: number; total: number };
};

function formatOccurred(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function EmployeeDisciplineSection({ employeeId, entries, totals }: EmployeeDisciplineSectionProps) {
  const todayDefault = new Date().toISOString().slice(0, 10);

  return (
    <details className="rounded-lg border border-amber-200 bg-amber-50/50">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-zinc-900">
        Union discipline · Att {totals.attendance} · Perf {totals.performance} · Total {totals.total}
      </summary>
      <div className="space-y-4 border-t border-amber-100 px-3 py-3">
        <p className="text-xs text-zinc-600">
          <a
            href="/api/facility/union-handbook"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-amber-900 underline decoration-amber-300 hover:text-amber-950"
          >
            Open union handbook (PDF)
          </a>
          <span className="text-zinc-500"> — from Organization settings when uploaded</span>
        </p>
        <form action={addDisciplinePointEntryAction} className="grid gap-2 rounded-md border border-zinc-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-6">
          <input type="hidden" name="employeeId" value={employeeId} />
          <div>
            <span className="block text-xs text-zinc-600">Category</span>
            <select name="category" required className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm">
              {(Object.keys(CATEGORY_LABEL) as DisciplinePointCategory[]).map((k) => (
                <option key={k} value={k}>
                  {CATEGORY_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <label className="text-xs text-zinc-600">
            Points
            <input
              name="points"
              type="number"
              min={1}
              max={999}
              required
              defaultValue={1}
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-zinc-600">
            Date
            <input
              name="occurredAt"
              type="date"
              required
              defaultValue={todayDefault}
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-zinc-600 sm:col-span-2 lg:col-span-2">
            Note (optional)
            <input name="note" className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
          </label>
          <div className="flex items-end lg:col-span-1">
            <button
              type="submit"
              className="w-full rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Add entry
            </button>
          </div>
        </form>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs text-zinc-500">
                <th className="py-1 pr-2">Date</th>
                <th className="py-1 pr-2">Type</th>
                <th className="py-1 pr-2">Pts</th>
                <th className="py-1 pr-2">Note</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {entries.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100">
                  <td className="py-1 pr-2 text-zinc-800">{formatOccurred(row.occurredAtIso)}</td>
                  <td className="py-1 pr-2 text-zinc-700">{CATEGORY_LABEL[row.category]}</td>
                  <td className="py-1 pr-2 font-medium text-zinc-900">{row.points}</td>
                  <td className="py-1 pr-2 text-zinc-600">{row.note ?? "—"}</td>
                  <td className="py-1 text-right">
                    <form action={deleteDisciplinePointEntryAction} className="inline">
                      <input type="hidden" name="entryId" value={row.id} />
                      <button
                        type="submit"
                        className="text-xs text-red-700 underline hover:text-red-900"
                      >
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-2 text-zinc-500">
                    No discipline entries yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}
