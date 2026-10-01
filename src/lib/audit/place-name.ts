/**
 * Forward place-name history.
 * A recorded rename knows the label before and after its effective service date.
 * Dates with no recorded rename use the current label and do not claim historical certainty.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

import {
  facilityLocalDateToServiceDate,
  getFacilityServiceDate,
  loadFacilityTimezone,
  resolveFacilityTimezone,
  toServiceDateKey,
} from "@/lib/operational-time";

type Db = PrismaClient | Prisma.TransactionClient;

export type PlaceNameChangeFact = {
  placeId: string;
  placeKind: "SPACE" | "UNIT";
  previousLabel: string;
  newLabel: string;
  effectiveFromKey: string;
};

export type PlaceLabelResolution = {
  label: string;
  certainty: "SNAPSHOT" | "HISTORICAL" | "CURRENT_LABEL";
};

export function resolvePlaceLabel(input: {
  serviceDateKey: string;
  currentLabel: string;
  history: readonly PlaceNameChangeFact[];
  recordSnapshot?: string | null;
}): PlaceLabelResolution {
  const snapshot = input.recordSnapshot?.trim() || null;
  if (snapshot) return { label: snapshot, certainty: "SNAPSHOT" };

  const history = [...input.history].sort((a, b) =>
    a.effectiveFromKey < b.effectiveFromKey ? -1 : a.effectiveFromKey > b.effectiveFromKey ? 1 : 0,
  );
  if (history.length === 0) {
    return { label: input.currentLabel, certainty: "CURRENT_LABEL" };
  }

  const inForce = [...history].reverse().find((row) => row.effectiveFromKey <= input.serviceDateKey);
  if (inForce) return { label: inForce.newLabel, certainty: "HISTORICAL" };
  return { label: history[0]!.previousLabel, certainty: "HISTORICAL" };
}

export async function appendPlaceNameChange(
  client: Db,
  input: {
    facilityId: string;
    placeKind: "SPACE" | "UNIT";
    unitSpaceId?: string | null;
    unitId?: string | null;
    previousLabel: string;
    newLabel: string;
    recordedByUserId?: string | null;
    now?: Date;
  },
): Promise<void> {
  const previousLabel = input.previousLabel.trim();
  const newLabel = input.newLabel.trim();
  if (!previousLabel || previousLabel === newLabel) return;
  const now = input.now ?? new Date();
  const timezone = resolveFacilityTimezone(
    await loadFacilityTimezone(client as PrismaClient, input.facilityId),
  );
  const effectiveFromKey = toServiceDateKey(getFacilityServiceDate(timezone, now));
  await client.placeNameChange.create({
    data: {
      facilityId: input.facilityId,
      placeKind: input.placeKind,
      unitSpaceId: input.unitSpaceId ?? null,
      unitId: input.unitId ?? null,
      previousLabel,
      newLabel,
      effectiveFrom: facilityLocalDateToServiceDate(effectiveFromKey),
      recordedAt: now,
      recordedByUserId: input.recordedByUserId ?? null,
    },
  });
}
