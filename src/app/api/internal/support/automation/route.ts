import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  isSupportAutomationCronAuthorized,
  processSupportAutomations,
} from "@/lib/support/automation-processor";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "cron_unconfigured" }, { status: 503 });
  }
  if (!isSupportAutomationCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await processSupportAutomations(prisma);
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "processing_failed" }, { status: 500 });
  }
}
