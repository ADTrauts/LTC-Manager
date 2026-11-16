import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE } from "@/lib/auth";
import { HARBOR_WORK_COOKIE } from "@/lib/harbor-console/session";
import { recordAssistanceConsent, withdrawAssistanceConsent } from "@/lib/harbor-console/assistance-governance";
import { assistanceNoStore, getAssistancePilot } from "@/lib/harbor-console/assistance-pilot";
import { sameOriginBrowserPost } from "@/lib/harbor-console/browser-post";

const id = z.string().min(1).max(100);
const commands = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("consent"), facilityId: id, staffId: id, minutes: z.number().int().min(1).max(1440) }),
  z.strictObject({ action: z.literal("withdraw"), facilityId: id, staffId: id, consentId: id }),
]);
const response = (body: object, status = 200) => NextResponse.json(body, { status, headers: assistanceNoStore });
const denied = () => response({ error: "Assistance unavailable." }, 404);

export async function POST(request: NextRequest) {
  const pilot = getAssistancePilot(request.headers.get("host") ?? request.nextUrl.host);
  if (!pilot || request.cookies.has(HARBOR_WORK_COOKIE)) return denied();
  if (!sameOriginBrowserPost(request)) return response({ error: "Forbidden." }, 403);
  const parsed = commands.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ error: "Invalid consent command." }, 400);
  const input = parsed.data;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  try {
    if (input.action === "consent") {
      const consentId = await recordAssistanceConsent(pilot, token, input);
      return consentId ? response({ consentId }, 201) : denied();
    }
    return await withdrawAssistanceConsent(pilot, token, input) ? response({ ok: true }) : denied();
  } catch {
    return response({ error: "Assistance temporarily unavailable." }, 503);
  }
}
