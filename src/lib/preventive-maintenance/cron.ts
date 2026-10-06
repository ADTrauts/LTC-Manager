import { NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { isPlantPmCronAuthorized } from "./cron-auth";
import { runPmGeneration } from "./generator";

export async function handlePlantPmCron(
  request: Request,
  client: PrismaClient = prisma,
  now?: Date,
) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "cron_unconfigured" }, { status: 503 });
  }
  if (!isPlantPmCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runPmGeneration(client, { now: now ?? new Date() });
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "processing_failed" }, { status: 500 });
  }
}
