import type { LocationFilterOption } from "@/lib/operational-review/present-operational-review-day";
import { Button } from "@/components/design-system/Button";
import { Select, TextInput } from "@/components/design-system/Field";
import { FilterPanel } from "@/components/design-system/FilterPanel";

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
    <form className="grid min-w-0 gap-3" method="get" action="/reports" data-testid={testId}>
      <div className="grid min-w-0 grid-cols-2 items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <TextInput label="Start service date" type="date" name="start" defaultValue={start} max={todayKey} />
        <TextInput label="End service date" type="date" name="end" defaultValue={end} max={todayKey} />
        <Button type="submit" className="col-span-2 md:col-span-1">Apply</Button>
      </div>
      <FilterPanel summary={[
        spaceId ? locationOptions.find((location) => location.spaceId === spaceId)?.displayLabel : null,
        definition, locationFunction,
      ].filter(Boolean).join(" · ") || "All locations"}>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {locationOptions.length > 0 ? (
          <Select label="Location" name="spaceId" defaultValue={spaceId ?? ""}>
            <option value="">All locations</option>
            {locationOptions.map((location) => (
              <option key={location.spaceId} value={location.spaceId}>
                {location.displayLabel}
              </option>
            ))}
          </Select>
        ) : null}
        <TextInput label="Record definition" name="definition" defaultValue={definition} placeholder="cooler_temperature" />
        <TextInput label="Location function" name="locationFunction" defaultValue={locationFunction} placeholder="food_service_area" />
        </div>
      </FilterPanel>
    </form>
  );
}
