import { NextResponse } from "next/server";

/**
 * Liveness: process is running and can answer HTTP.
 * No database access. No secrets. Safe for load-balancer probes.
 */
export async function GET() {
  return NextResponse.json(
    { status: "ok", check: "live" },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
