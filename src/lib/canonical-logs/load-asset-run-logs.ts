/**
 * Asset RUN Logs — thin wrapper over the shared target loader.
 */

import type { PrismaClient } from "@prisma/client";

import type { AppJwtPayload } from "@/lib/auth";

import {
  loadTargetRunLogs,
  type TargetRunLogsView,
} from "./load-target-run-logs";

export type AssetRunLogHistoryTable = TargetRunLogsView["history"][number];
export type AssetRunLogsView = TargetRunLogsView;

export async function loadAssetRunLogs(input: {
  client: PrismaClient;
  session: AppJwtPayload;
  facilityId: string;
  assetId: string;
  historyDays?: number;
  now?: Date;
}): Promise<TargetRunLogsView | null> {
  return loadTargetRunLogs({
    client: input.client,
    session: input.session,
    facilityId: input.facilityId,
    target: { kind: "ASSET", id: input.assetId },
    historyDays: input.historyDays,
    now: input.now,
  });
}
