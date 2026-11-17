import { type NextRequest, NextResponse } from "next/server";
import { readPilotAudit } from "@/lib/harbor-console/assistance-governance";
import { acceptsAssistanceDocument, assistanceNoStore, getAssistancePilot } from "@/lib/harbor-console/assistance-pilot";
import { HARBOR_SESSION_COOKIE, HARBOR_WORK_COOKIE } from "@/lib/harbor-console/session";

export const dynamic = "force-dynamic";

const headers = { ...assistanceNoStore, "X-Content-Type-Options": "nosniff" };
const denied = () => NextResponse.json({ error: "Assistance unavailable." }, { status: 404, headers });

export async function GET(request: NextRequest) {
  const pilot = getAssistancePilot(request.headers.get("host") ?? request.nextUrl.host);
  if (!pilot || request.cookies.has(HARBOR_WORK_COOKIE) || request.nextUrl.search ||
      !acceptsAssistanceDocument(request.headers)) return denied();
  try {
    const events = await readPilotAudit(pilot, request.cookies.get(HARBOR_SESSION_COOKIE)?.value);
    return events ? NextResponse.json({ events }, { headers }) : denied();
  } catch {
    return NextResponse.json({ error: "Assistance temporarily unavailable." }, { status: 503, headers });
  }
}
