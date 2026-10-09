import type { Prisma, PrismaClient } from "@prisma/client";

import { loadPartnerRunLogRequirements } from "@/lib/canonical-logs/partner-log-read";
import type { RunLogRequirementView } from "@/lib/canonical-logs/run-presentation";
import { partnerAssetWhere } from "@/lib/asset-operations/partner-asset-where";
import { loadPartnerOperationalReview } from "@/lib/operational-review/load-partner-operational-review";
import type { OperationalReviewDayPresentation } from "@/lib/operational-review/present-operational-review-day";
import { getFacilityServiceDate, loadFacilityTimezone, toServiceDateKey } from "@/lib/operational-time";
import { canPartner } from "@/lib/partner-user-access";
import type { PartnerOperationalContext } from "@/lib/partner-operational-context";

import {
  summarizeDashboardAssets,
  summarizeDashboardLogs,
  summarizeDashboardReview,
  type PartnerDashboardViewModel,
} from "./summarize-partner-dashboard";

type Db = PrismaClient | Prisma.TransactionClient;

export type PartnerDashboardReads = {
  review: (input: {
    facilityId: string;
    departmentId: string;
    serviceDate: string;
    now: Date;
  }) => Promise<OperationalReviewDayPresentation>;
  logs: (input: {
    facilityId: string;
    departmentId: string;
    now: Date;
  }) => Promise<RunLogRequirementView[]>;
};

async function readReviewDay(input: {
  client: Db;
  facilityId: string;
  departmentId: string;
  serviceDate: string;
  now: Date;
}): Promise<OperationalReviewDayPresentation> {
  const loaded = await loadPartnerOperationalReview({
    client: input.client,
    facilityId: input.facilityId,
    departmentId: input.departmentId,
    date: input.serviceDate,
    now: input.now,
  });
  if (loaded.mode !== "day") {
    throw new Error("Partner Dashboard Review is a single service day.");
  }
  return loaded.presentation;
}

async function readLogRequirements(input: {
  client: Db;
  context: PartnerOperationalContext;
  now: Date;
}): Promise<RunLogRequirementView[]> {
  const bundle = await loadPartnerRunLogRequirements({
    client: input.client as PrismaClient,
    context: input.context,
    now: input.now,
  });
  return bundle.requirements;
}

/**
 * Current Department Dashboard. Composes certified Review, Logs, and Asset reads.
 * Does not score them together and does not resolve partner authorization.
 */
export async function loadPartnerDashboard(input: {
  client: Db;
  context: PartnerOperationalContext;
  departmentName: string;
  now?: Date;
  reads?: PartnerDashboardReads;
}): Promise<PartnerDashboardViewModel> {
  const now = input.now ?? new Date();
  const facilityId = input.context.facilityId;
  const departmentId = input.context.activeDepartmentId;
  const serviceDate = toServiceDateKey(
    getFacilityServiceDate(await loadFacilityTimezone(input.client as PrismaClient, facilityId), now),
  );
  const role = input.context.effectiveRole;
  const reviewEnabled = canPartner(role, "review.read");
  const logsEnabled = canPartner(role, "logs.read");
  const assetsEnabled = canPartner(role, "assets.read");

  const [review, logs, assetGroups] = await Promise.all([
    reviewEnabled
      ? (input.reads?.review ?? ((query) => readReviewDay({ client: input.client, ...query })))({
          facilityId,
          departmentId,
          serviceDate,
          now,
        })
      : null,
    logsEnabled
      ? (
          input.reads?.logs ??
          ((query) =>
            readLogRequirements({
              client: input.client,
              context: input.context,
              now: query.now,
            }))
        )({ facilityId, departmentId, now })
      : null,
    assetsEnabled
      ? input.client.asset.groupBy({
          by: ["status"],
          where: partnerAssetWhere({ facilityId, departmentId }),
          _count: { id: true },
        })
      : null,
  ]);

  return {
    serviceDate,
    departmentName: input.departmentName,
    review: review ? summarizeDashboardReview(review) : null,
    logs: logs ? summarizeDashboardLogs(logs) : null,
    assets: assetGroups
      ? summarizeDashboardAssets(
          assetGroups.map((group) => ({ status: group.status, count: group._count.id })),
          input.departmentName,
        )
      : null,
  };
}
