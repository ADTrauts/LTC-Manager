import Link from "next/link";
import { Button } from "@/components/design-system/Button";
import { TextInput } from "@/components/design-system/Field";
import { FilterPanel } from "@/components/design-system/FilterPanel";
import { PageHeader } from "@/components/design-system/page-header";

type Params = Record<string, string | undefined | null>;
function href(params: Params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  return `/staffing?${query}`;
}
const controlClass = "inline-flex min-h-11 items-center justify-center rounded-md border px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700";
const linkClass = `${controlClass} border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50`;

export function ScheduleToolbar({ date, label, view, mode, previousDate, nextDate, today, filters, showAssignments, showCycles }: {
  date: string;
  label: string;
  view: "employee" | "location";
  mode: "week" | "day";
  previousDate: string;
  nextDate: string;
  today: string;
  filters: Params;
  showAssignments: boolean;
  showCycles: boolean;
}) {
  const base = { ...filters, date, view, mode };
  const selected = "border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800";
  return (
    <PageHeader title="Schedule" compact below={
      <div className="space-y-3" data-testid="schedule-toolbar">
        <div className="flex flex-wrap gap-2">
          <div role="tablist" aria-label="Schedule view" className="flex gap-1">
            <Link role="tab" aria-selected={view === "employee"} href={href({ ...base, view: "employee" })}
              data-testid="view-toggle-employee" className={`${controlClass} ${view === "employee" ? selected : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"}`}>
              <span className="sm:hidden">Employees</span><span className="hidden sm:inline">Employee View</span>
            </Link>
            <Link role="tab" aria-selected={view === "location"} href={href({ ...base, view: "location", mode: "week" })}
              data-testid="view-toggle-location" className={`${controlClass} ${view === "location" ? selected : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"}`}>
              <span className="sm:hidden">Locations</span><span className="hidden sm:inline">Location View</span>
            </Link>
          </div>
          <nav aria-label="Schedule period" className="flex gap-1">
            <Link href={href({ ...base, mode: "week" })} data-testid="mode-week" aria-current={mode === "week" ? "page" : undefined}
              className={`${controlClass} ${mode === "week" ? "bg-zinc-100 border-zinc-500 text-zinc-900" : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"}`}>Week</Link>
            <Link href={href({ ...base, view: "employee", mode: "day" })} data-testid="mode-day" aria-label="Day roster" aria-current={mode === "day" ? "page" : undefined}
              className={`${controlClass} ${mode === "day" ? "bg-zinc-100 border-zinc-500 text-zinc-900" : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50"}`}><span className="sm:hidden">Day</span><span className="hidden sm:inline">Day roster</span></Link>
          </nav>
        </div>
        <div className="space-y-3 xl:flex xl:flex-wrap xl:items-end xl:gap-3 xl:space-y-0">
        <p className="text-sm font-medium text-zinc-800 xl:flex xl:min-h-10 xl:items-center">{label}</p>
        <div className="grid grid-cols-3 gap-2 sm:flex">
          <Link href={href({ ...base, date: previousDate })} aria-label={mode === "week" ? "Previous week" : "Previous day"} className={linkClass}>Previous</Link>
          <Link href={href({ ...base, date: today })} className={linkClass}>{mode === "week" ? "This week" : "Today"}</Link>
          <Link href={href({ ...base, date: nextDate })} aria-label={mode === "week" ? "Next week" : "Next day"} className={linkClass}>Next</Link>
        </div>
        <FilterPanel title="Date & schedule tools" className="xl:flex-1">
          <div className="flex flex-wrap items-end gap-2">
            <form action="/staffing" method="get" className="flex min-w-0 flex-1 items-end gap-2 sm:flex-none">
              {Object.entries(base).filter(([key, value]) => key !== "date" && value).map(([key, value]) => <input key={key} type="hidden" name={key} value={value ?? ""} />)}
              <TextInput label="Go to date" type="date" name="date" defaultValue={date} fieldClassName="min-w-0 flex-1 xl:[&>label]:sr-only" />
              <Button type="submit" variant="secondary">Go</Button>
            </form>
            {showAssignments ? <Link href={`/staffing/assignments?date=${date}`} className={linkClass}>Daily Assignments</Link> : null}
            {showCycles ? <Link href="/staffing/cycles" className={linkClass}>Cycle overview</Link> : null}
          </div>
        </FilterPanel>
        </div>
      </div>
    } />
  );
}
