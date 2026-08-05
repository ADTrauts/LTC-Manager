import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { DEVICE_FACILITY_COOKIE, DEVICE_UNIT_COOKIE } from "@/lib/device-cookie";
import { buildRuntimeBundle } from "@/lib/offline/build-runtime-bundle";
import { processSyncCommand } from "@/lib/offline/process-sync-command";
import {
  OFFLINE_COMMAND_TYPES,
  OFFLINE_SYNC_MAX_BATCH,
  type OfflineCommandEnvelope,
  type OfflineSyncResponse,
} from "@/lib/offline/types";

const commandSchema = z.object({
  clientCommandId: z.string().trim().min(8).max(120),
  commandType: z.enum(OFFLINE_COMMAND_TYPES),
  facilityId: z.string().cuid(),
  departmentId: z.string().cuid(),
  unitId: z.string().cuid(),
  operationalDate: z.string().trim().min(8).max(32),
  mealType: z.enum(["BREAKFAST", "LUNCH", "DINNER"]),
  occurredAt: z.string().trim().min(1),
  locallyRecordedAt: z.string().trim().min(1),
  deviceBoundUnitId: z.string().cuid().nullable(),
  actorRef: z.string().trim().min(3).max(120),
  authMethod: z.enum(["PASSWORD", "QUICK_PIN"]),
  role: z.string().trim().min(3).max(40),
  bundleVersion: z.string().trim().min(3).max(120),
  expectedServerRevision: z.string().trim().min(3).max(120),
  deviceTimezoneOffsetMinutes: z.number().int().min(-840).max(840),
});

const bodySchema = z.object({
  unitId: z.string().cuid(),
  commands: z.array(commandSchema).max(OFFLINE_SYNC_MAX_BATCH),
});

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 64_000;

async function readDeviceContext() {
  const jar = await cookies();
  return {
    deviceFacilityId: jar.get(DEVICE_FACILITY_COOKIE)?.value?.trim() || null,
    deviceBoundUnitId: jar.get(DEVICE_UNIT_COOKIE)?.value?.trim() || null,
  };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request too large." }, { status: 413, headers: NO_STORE });
  }

  const session = await getSession();
  if (!session) {
    const response: OfflineSyncResponse = {
      results: [],
      bundle: null,
      reauthenticationRequired: true,
      deviceRevoked: false,
    };
    return NextResponse.json(response, { status: 401, headers: NO_STORE });
  }

  let parsedBody: z.infer<typeof bodySchema>;
  try {
    parsedBody = bodySchema.parse(JSON.parse(rawBody));
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE });
  }

  const device = await readDeviceContext();
  if (!device.deviceFacilityId) {
    return NextResponse.json({ error: "Device not enrolled." }, { status: 403, headers: NO_STORE });
  }

  const results = [];
  for (const command of parsedBody.commands as OfflineCommandEnvelope[]) {
    if (command.unitId !== parsedBody.unitId) {
      results.push({
        clientCommandId: command.clientCommandId,
        category: "REJECTED" as const,
        reasonCode: "UNIT_MISMATCH",
        authoritativeRecordId: null,
        serverAcceptedAt: null,
        serverRevision: null,
        retryAfterSeconds: null,
        conflictCategory: null,
        authoritativeMilestone: null,
      });
      continue;
    }
    results.push(
      await processSyncCommand({
        session,
        command,
        deviceFacilityId: device.deviceFacilityId,
        deviceBoundUnitId: device.deviceBoundUnitId,
      }),
    );
  }

  const bundleResult = await buildRuntimeBundle({
    session,
    unitId: parsedBody.unitId,
    deviceFacilityId: device.deviceFacilityId,
    deviceBoundUnitId: device.deviceBoundUnitId,
  });

  const response: OfflineSyncResponse = {
    results,
    bundle: bundleResult.ok ? bundleResult.bundle : null,
    reauthenticationRequired: false,
    deviceRevoked: false,
  };

  return NextResponse.json(response, { headers: NO_STORE });
}
