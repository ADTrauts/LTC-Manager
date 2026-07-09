import Link from "next/link";
import { UnitType } from "@prisma/client";

import { fmtMealLabel } from "@/lib/operations-center/fmt-meal-label";
import { getOperationsCenterCardOrder, type OperationsCenterCardId } from "@/lib/operations-center/card-registry";
import type { OperationsCenterDashboardData } from "@/lib/operations-center/types";

type OperationsCenterCardsProps = {
  data: OperationsCenterDashboardData;
};

function UnitExceptionsCard({ data }: { data: OperationsCenterDashboardData }) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">Unit Exceptions</h2>
      <p className="mt-1 text-xs text-zinc-500">Failed, missed, or pending logs and operational issues by location.</p>
      <div className="mt-3 space-y-2">
        {data.unitsWithExceptions.map((unit) => (
          <div key={unit.id} className="flex items-center justify-between rounded border border-zinc-200 p-2">
            <div>
              <p className="text-sm font-medium text-zinc-900">{unit.name}</p>
              <p className="text-xs text-zinc-600">
                Pending {unit.pending} · Failed {unit.failed} · Missed {unit.missed} · Staff{" "}
                {unit.staffingCount} · Repairs {unit.openRepairCount}
              </p>
            </div>
            <Link
              href={`/unit/${unit.id}`}
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100"
            >
              Open unit
            </Link>
          </div>
        ))}
        {data.unitsWithExceptions.length === 0 ? (
          <p className="text-sm text-zinc-500">No log exceptions right now.</p>
        ) : null}
      </div>
    </article>
  );
}

function OpenRepairsCard({ data }: { data: OperationsCenterDashboardData }) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Open Repairs</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {data.openRepairCount} open · {data.urgentRepairCount} urgent
          </p>
        </div>
        <Link href="/repairs" className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100">
          View repairs
        </Link>
      </div>
      {data.urgentRepairCount > 0 ? (
        <p className="mt-3 text-sm font-medium text-red-700">
          Urgent equipment issues need supervisor follow-up before service.
        </p>
      ) : data.openRepairCount > 0 ? (
        <p className="mt-3 text-sm text-zinc-600">Review open work orders and assign recovery owners.</p>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">No open repairs.</p>
      )}
    </article>
  );
}

function StaffingGapsCard({ data }: { data: OperationsCenterDashboardData }) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Staffing Gaps</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {data.unitsMissingStaffing.length} location{data.unitsMissingStaffing.length === 1 ? "" : "s"} missing
            coverage today
          </p>
        </div>
        <Link href="/staffing" className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100">
          Open staffing
        </Link>
      </div>
      <ul className="mt-3 space-y-1 text-sm text-zinc-700">
        {data.unitsMissingStaffing.map((unit) => (
          <li key={unit.id}>
            <Link href={`/staffing?unitId=${unit.id}`} className="text-zinc-900 underline hover:text-zinc-700">
              {unit.name}
            </Link>
          </li>
        ))}
        {data.unitsMissingStaffing.length === 0 ? (
          <li className="text-zinc-500">All staffed locations have coverage scheduled.</li>
        ) : null}
      </ul>
    </article>
  );
}

function CallDownsCard({ data }: { data: OperationsCenterDashboardData }) {
  const callDowns = data.callDowns ?? {
    items: [],
    summary: { total: 0, open: 0, covered: 0 },
    dateIso: "",
  };
  const openItems = callDowns.items.filter((item) => item.status === "open");

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid="operations-center-call-downs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Call-downs</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {openItems.length} open · {callDowns.summary.total} logged today
          </p>
        </div>
        <Link href="/today" className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100">
          Today&apos;s Work
        </Link>
      </div>
      <ul className="mt-3 space-y-2 text-sm text-zinc-700">
        {openItems.slice(0, 5).map((item) => (
          <li key={item.id} className="rounded border border-zinc-200 p-2">
            <p className="font-medium text-zinc-900">{item.employeeName}</p>
            <p className="text-xs text-zinc-600">{item.reason}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {item.oldUnitName ?? item.newUnitName}
              {item.oldUnitName && item.oldUnitName !== item.newUnitName ? ` → ${item.newUnitName}` : ""}
            </p>
            <Link href={item.staffingHref} className="mt-2 inline-block text-xs font-medium text-zinc-900 underline hover:text-zinc-700">
              Fix staffing
            </Link>
          </li>
        ))}
        {openItems.length === 0 ? (
          <li className="text-zinc-500">No open call-downs right now.</li>
        ) : null}
      </ul>
    </article>
  );
}

function ComplianceSummaryCard({ data }: { data: OperationsCenterDashboardData }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Expected Logs</p>
        <p className="mt-2 text-2xl font-semibold text-zinc-900">{data.totals.expected}</p>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Completed</p>
        <p className="mt-2 text-2xl font-semibold text-green-700">{data.totals.completed}</p>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Pending</p>
        <p className="mt-2 text-2xl font-semibold text-yellow-700">{data.totals.pending}</p>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Failed</p>
        <p className="mt-2 text-2xl font-semibold text-red-700">{data.totals.failed}</p>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Missed</p>
        <p className="mt-2 text-2xl font-semibold text-red-700">{data.totals.missed}</p>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Units Missing Staffing</p>
        <p className="mt-2 text-2xl font-semibold text-red-700">{data.unitsMissingStaffing.length}</p>
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Open Repairs</p>
        <p className="mt-2 text-2xl font-semibold text-red-700">
          {data.openRepairCount}
          <span className="ml-1 text-sm font-medium text-zinc-500">({data.urgentRepairCount} urgent)</span>
        </p>
      </div>
    </section>
  );
}

function MealBoardsCard({ data }: { data: OperationsCenterDashboardData }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">Meal Boards</h2>
      <p className="mt-1 max-w-3xl text-xs text-zinc-500">
        Serveries list only while a ready or started tap for that meal is within the last hour; status shows Ready
        and/or Started. Other units show log status (Logged or Not logged).
      </p>
      <div className="mt-3 grid gap-4 lg:grid-cols-3">
        {data.mealBoards.map((board) => (
          <article key={board.meal} className="rounded-lg border border-zinc-200 p-3">
            <h3 className="text-sm font-semibold text-zinc-900">{fmtMealLabel(board.meal)}</h3>
            <div className="mt-2 space-y-1">
              {board.rows.map((row) => (
                <div key={row.unitId} className="flex items-center justify-between text-xs">
                  <span className="text-zinc-700">{row.unitName}</span>
                  <span className="text-zinc-500">
                    {row.mealTime} ·{" "}
                    {row.unitType === UnitType.SERVERY ? (
                      <>
                        {row.isReadyLive ? <span className="font-semibold text-yellow-700">Ready</span> : null}
                        {row.isReadyLive && row.isStartedLive ? <span className="text-zinc-400"> · </span> : null}
                        {row.isStartedLive ? <span className="font-semibold text-emerald-700">Started</span> : null}
                        {!row.isReadyLive && !row.isStartedLive ? "—" : null}
                      </>
                    ) : (
                      row.statusLabel
                    )}
                  </span>
                </div>
              ))}
              {board.rows.length === 0 ? (
                <p className="text-xs text-zinc-500">No units on this board for this meal.</p>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function UnitLogBoardCard({ data }: { data: OperationsCenterDashboardData }) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">Unit Log Board</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500">
              <th className="py-2 pr-3">Unit</th>
              <th className="py-2 pr-3">Expected</th>
              <th className="py-2 pr-3">Completed</th>
              <th className="py-2 pr-3">Pending</th>
            </tr>
          </thead>
          <tbody>
            {data.unitCards.map((unit) => (
              <tr key={unit.id} className="border-b border-zinc-100">
                <td className="py-2 pr-3">
                  <Link href={`/unit/${unit.id}`} className="text-zinc-900 hover:underline">
                    {unit.name}
                  </Link>
                </td>
                <td className="py-2 pr-3 text-zinc-700">{unit.expected}</td>
                <td className="py-2 pr-3 text-zinc-700">{unit.completed}</td>
                <td className="py-2 pr-3 text-zinc-700">{unit.pending}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function renderCard(id: OperationsCenterCardId, data: OperationsCenterDashboardData) {
  switch (id) {
    case "unit-exceptions":
      return <UnitExceptionsCard key={id} data={data} />;
    case "open-repairs":
      return <OpenRepairsCard key={id} data={data} />;
    case "staffing-gaps":
      return <StaffingGapsCard key={id} data={data} />;
    case "call-downs":
      return <CallDownsCard key={id} data={data} />;
    case "compliance-summary":
      return <ComplianceSummaryCard key={id} data={data} />;
    case "meal-boards":
      return <MealBoardsCard key={id} data={data} />;
    case "unit-log-board":
      return <UnitLogBoardCard key={id} data={data} />;
    default:
      return null;
  }
}

export function OperationsCenterCards({ data }: OperationsCenterCardsProps) {
  const order = getOperationsCenterCardOrder();
  const primaryCards = order.slice(0, 4);
  const secondaryRow = order.slice(4, 6);
  const tertiaryCard = order[6];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-2">{primaryCards.map((id) => renderCard(id, data))}</section>
      {secondaryRow.map((id) => renderCard(id, data))}
      {tertiaryCard ? renderCard(tertiaryCard, data) : null}
    </div>
  );
}
