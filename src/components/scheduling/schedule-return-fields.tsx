/**
 * Shared hidden fields so Shift actions return to the same weekly context.
 */
export function ScheduleReturnFields({
  date,
  view,
  mode,
}: {
  date: string;
  view: "employee" | "location";
  mode: "week" | "day";
}) {
  return (
    <>
      <input type="hidden" name="returnDate" value={date} />
      <input type="hidden" name="returnView" value={view} />
      <input type="hidden" name="returnMode" value={mode} />
    </>
  );
}
