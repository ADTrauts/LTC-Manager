import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { isSupportAutomationCronAuthorized } from "@/lib/support/automation-processor";
import { getSupportAttachmentStore } from "@/lib/support/attachment-store";
import { getSupportAttachmentScanner } from "@/lib/support/attachment-scanner";
import { processPendingSupportAttachments } from "@/lib/support/scan-pending-attachments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const headers = { "Cache-Control": "no-store" };

export function HEAD() {
  return new NextResponse(null, { status: 405, headers: { ...headers, Allow: "GET" } });
}

/** Separate from inbound email and automation: neither waits for a file scan. */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "cron_unconfigured" }, { status: 503, headers });
  }
  if (!isSupportAutomationCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers });
  }

  try {
    const scanner = getSupportAttachmentScanner();
    const store = getSupportAttachmentStore();
    if (!scanner || !store) {
      return NextResponse.json(
        { ok: false, error: !scanner ? "scanner_unconfigured" : "storage_unconfigured" },
        { status: 503, headers },
      );
    }

    // Three 55-second scan calls leave room for private storage and receipt commits.
    // The existing processor owns claims, retry times, attempt limits and byte checks.
    const result = await processPendingSupportAttachments(prisma, { scanner, store, limit: 3 });
    const counts = { clean: 0, blocked: 0, retryPending: 0, failed: 0, unavailable: 0 };
    for (const item of result.results) {
      if (item.status === "CLEAN") counts.clean += 1;
      else if (item.status === "BLOCKED") counts.blocked += 1;
      else if (item.status === "PENDING") counts.retryPending += 1;
      else if (item.status === "SCAN_FAILED") counts.failed += 1;
      else counts.unavailable += 1;
    }

    // Counts only: cron responses never disclose attachment or customer identifiers.
    const summary = { claimed: result.claimed, ...counts };
    console.info("support.attachment_scans.completed", summary);
    return NextResponse.json({ ok: true, ...summary }, { headers });
  } catch {
    return NextResponse.json({ ok: false, error: "processing_failed" }, { status: 500, headers });
  }
}
