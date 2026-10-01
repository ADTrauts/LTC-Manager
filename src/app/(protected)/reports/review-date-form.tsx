import type { LocationFilterOption } from "@/lib/operational-review/present-operational-review-day";

export function ReviewDateForm({
  start,
  end,
  todayKey,
  spaceId,
  locationOptions,
  testId,
  definition = "",
  locationFunction = "",
}: {
  start: string;
  end: string;
  todayKey: string;
  spaceId: string | null;
  locationOptions: readonly LocationFilterOption[];
  testId: string;
  definition?: string;
  locationFunction?: string;
}) {
  return (
    <form className="flex flex-wrap items-end gap-3" method="get" action="/reports" data-testid={testId}>
      <label className="space-y-1 text-sm">
        <span className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Start service date
        </span>
        <input className="app-input" type="date" name="start" defaultValue={start} max={todayKey} />
      </label>
      <label className="space-y-1 text-sm">
        <span className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
          End service date
        </span>
        <input className="app-input" type="date" name="end" defaultValue={end} max={todayKey} />
      </label>
      {locationOptions.length > 0 ? (
        <label className="space-y-1 text-sm">
          <span className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Location</span>
          <select className="app-input min-w-48" name="spaceId" defaultValue={spaceId ?? ""}>
            <option value="">All locations</option>
            {locationOptions.map((location) => (
              <option key={location.spaceId} value={location.spaceId}>
                {location.displayLabel}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="space-y-1 text-sm">
        <span className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Record definition
        </span>
        <input
          className="app-input min-w-48"
          name="definition"
          defaultValue={definition}
          placeholder="cooler_temperature"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Location function
        </span>
        <input
          className="app-input min-w-40"
          name="locationFunction"
          defaultValue={locationFunction}
          placeholder="food_service_area"
        />
      </label>
      <button type="submit" className="app-button bg-zinc-900 text-white hover:bg-zinc-700">
        Apply
      </button>
    </form>
  );
}
