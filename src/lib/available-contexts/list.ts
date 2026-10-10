import type { Prisma, PrismaClient } from "@prisma/client";

import { listInternalFacilityContexts } from "./internal";
import { listOrganizationContexts } from "./organization";
import { listPartnerFacilityContexts } from "./partner";
import type { AvailableContext, AvailableContextRecord } from "./types";
import { assertActiveUser } from "./user";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function listAvailableContextRecords(
  db: DbClient,
  input: { userId: string; now?: Date },
): Promise<AvailableContextRecord[]> {
  const user = await assertActiveUser(db, input.userId);
  const now = input.now;
  const [organizations, internals, partners] = await Promise.all([
    listOrganizationContexts(db, { userId: user.id, now }),
    listInternalFacilityContexts(db, {
      userId: user.id,
      homeFacilityId: user.facilityId,
      now,
    }),
    listPartnerFacilityContexts(db, { userId: user.id, now }),
  ]);
  return [...organizations, ...internals, ...partners];
}

export async function listAvailableContexts(
  db: DbClient,
  input: { userId: string; now?: Date },
): Promise<AvailableContext[]> {
  const records = await listAvailableContextRecords(db, input);
  return records.map((record) => record.context);
}
