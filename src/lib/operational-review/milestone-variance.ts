import { parseFacilityLocalScheduledStart } from "@/lib/operational-time";

export function milestoneVarianceLabel(input: {
  serviceDate: string;
  timezone: string;
  expectedTimeLocal: string | null;
  actualOccurredAt: string | null;
}): string | null {
  if (!input.expectedTimeLocal || !input.actualOccurredAt) return null;
  const probe = new Date(`${input.serviceDate}T17:00:00.000Z`);
  const expected = parseFacilityLocalScheduledStart(input.expectedTimeLocal, probe, input.timezone);
  if (!expected) return null;
  const actual = new Date(input.actualOccurredAt);
  if (Number.isNaN(actual.getTime())) return null;
  const minutes = Math.round((actual.getTime() - expected.getTime()) / 60_000);
  if (minutes === 0) return "On time";
  if (minutes > 0) return `${minutes} min late`;
  return `${Math.abs(minutes)} min early`;
}
