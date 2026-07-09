import { AppCard } from "@/components/design-system/AppCard";
import { SectionHeader } from "@/components/design-system/SectionHeader";
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
    context.scheduledTimeLabel != null ? `starts ${context.scheduledTimeLabel}` : countdown;

  return (
    <AppCard as="section">
      <SectionHeader
        eyebrow="Active operation"
        title={`${context.serviceLabel} — ${context.phase}`}
        description={scheduleHint ?? "Scheduled service times not configured for this meal period."}
        prominent
      />
    </AppCard>
  );
}
