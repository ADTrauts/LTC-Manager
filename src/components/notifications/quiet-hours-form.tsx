import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";

export type QuietHoursFormPreference = {
  quietEnabled: boolean;
  quietStartMinute: number | null;
  quietEndMinute: number | null;
};

export function QuietHoursForm({
  facilityName,
  timeZone,
  deliveryActive,
  preference,
  action,
}: {
  facilityName: string;
  timeZone: string;
  deliveryActive: boolean;
  preference: QuietHoursFormPreference;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action} className="space-y-4" data-testid="quiet-hours">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Quiet Hours</h2>
        <div className="mt-2 space-y-2 text-sm text-zinc-600">
          <p>Pause informational browser alerts during selected hours.</p>
          <p>Quiet Hours apply to informational Updates only. Operational attention requiring action can still notify you.</p>
          <p>
            These hours belong to you at {facilityName}. The clock is {timeZone}.
          </p>
          {deliveryActive ? null : (
            <p data-testid="quiet-hours-delivery">
              Browser delivery is not active yet. Saved hours apply when it is. They do not change notifications being sent now.
            </p>
          )}
        </div>
      </div>
      <label className="flex min-h-10 items-center gap-2 text-sm text-zinc-800">
        <input
          type="checkbox"
          name="quietEnabled"
          defaultChecked={preference.quietEnabled}
          className={FOCUS_RING_CLASS}
        />
        Enable Quiet Hours
      </label>
      <div className="flex flex-wrap gap-4">
        <label className="space-y-1 text-sm text-zinc-700">
          <span className="block">From</span>
          <input
            type="time"
            name="quietStart"
            required
            defaultValue={clockFromMinute(preference.quietStartMinute, "22:00")}
            className={`rounded-md border border-zinc-300 px-2 py-2 ${FOCUS_RING_CLASS}`}
          />
        </label>
        <label className="space-y-1 text-sm text-zinc-700">
          <span className="block">Until</span>
          <input
            type="time"
            name="quietEnd"
            required
            defaultValue={clockFromMinute(preference.quietEndMinute, "07:00")}
            className={`rounded-md border border-zinc-300 px-2 py-2 ${FOCUS_RING_CLASS}`}
          />
        </label>
      </div>
      <button
        type="submit"
        className={`inline-flex min-h-10 items-center rounded-md border border-zinc-300 bg-white px-3.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 ${FOCUS_RING_CLASS}`}
      >
        Save Quiet Hours
      </button>
    </form>
  );
}

function clockFromMinute(minute: number | null, fallback: string): string {
  if (minute == null || minute < 0 || minute > 1439) return fallback;
  const hours = Math.floor(minute / 60);
  const mins = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}
