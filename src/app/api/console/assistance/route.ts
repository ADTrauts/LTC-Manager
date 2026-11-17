import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { approveAssistanceGrant, endPilotAssistance, revokePilotAssistance, switchAssistanceContext } from "@/lib/harbor-console/assistance-governance";
import { ASSISTANCE_VIEW, assistanceNoStore, getAssistancePilot } from "@/lib/harbor-console/assistance-pilot";
import { assistanceReference } from "@/lib/harbor-console/assistance-store";
import { sameOriginBrowserPost } from "@/lib/harbor-console/browser-post";
import { HARBOR_SESSION_COOKIE, HARBOR_WORK_COOKIE } from "@/lib/harbor-console/session";

const id = z.string().min(1).max(100);
const ref = z.string().regex(assistanceReference);
const commands = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("approve"), facilityId: id, staffId: id, consentId: id }),
  z.strictObject({ action: z.literal("revoke"), facilityId: id, staffId: id, grantId: id }),
  z.strictObject({ action: z.literal("start"), facilityId: id, grantId: id, requestId: ref, switchFrom: ref.optional() }),
  z.strictObject({ action: z.literal("end"), reference: ref }),
]);
const response = (body: object, status = 200) => NextResponse.json(body, { status, headers: assistanceNoStore });
const denied = () => response({ error: "Assistance unavailable." }, 404);

export async function POST(request: NextRequest) {
  const pilot = getAssistancePilot(request.headers.get("host") ?? request.nextUrl.host);
  if (!pilot || request.cookies.has(HARBOR_WORK_COOKIE)) return denied();
  const origin = sameOriginBrowserPost(request);
  if (!origin) return response({ error: "Forbidden." }, 403);
  const parsed = commands.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ error: "Invalid assistance command." }, 400);
  const input = parsed.data;
  const token = request.cookies.get(HARBOR_SESSION_COOKIE)?.value;
  try {
    switch (input.action) {
      case "approve": {
        const grantId = await approveAssistanceGrant(pilot, token, input);
        return grantId ? response({ grantId }, 201) : denied();
      }
      case "revoke":
        return await revokePilotAssistance(pilot, token, input) ? response({ ok: true }) : denied();
      case "start": {
        if (!await switchAssistanceContext(pilot, token, input)) return denied();
        const destination = new URL(ASSISTANCE_VIEW, origin);
        destination.searchParams.set("context", input.requestId);
        return new NextResponse(null, { status: 303, headers: { ...assistanceNoStore, Location: destination.href } });
      }
      case "end":
        return await endPilotAssistance(pilot, token, input.reference) ? response({ ok: true }) : denied();
    }
  } catch {
    return response({ error: "Assistance temporarily unavailable." }, 503);
  }
}
