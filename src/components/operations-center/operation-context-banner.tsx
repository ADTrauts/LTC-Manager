import type { OperationContext } from "@/lib/operations-center/types";

type OperationContextBannerProps = {
  context: OperationContext;
};

function formatCountdown(minutes: number | null): string | null {
  if (minutes === null) return null;
  if (minutes <= 0) return "service window active";
  if (minutes < 60) return `starts in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `starts in ${hours}h ${remainder}m` : `starts in ${hours}h`;
}

export function OperationContextBanner({ context }: OperationContextBannerProps) {
  const countdown = formatCountdown(context.minutesUntilService);
  const scheduleHint =
    context.scheduledTimeLabel != null
      ? `starts ${context.scheduledTimeLabel}`
      : countdown;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Active operation</p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
        {context.serviceLabel} — {context.phase}
      </h2>
      <p className="mt-1 text-sm text-zinc-600">
        {scheduleHint ?? "Scheduled service times not configured for this meal period."}
      </p>
    </section>
  );
}
