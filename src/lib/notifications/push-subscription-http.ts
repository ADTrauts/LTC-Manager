import { NextResponse } from "next/server";

import { getAppSession } from "@/lib/auth";
import { PushSubscriptionError } from "@/lib/notifications/push-subscription";
import {
  canReleaseBrowserPush,
  pushRegistrationUserId,
} from "@/lib/notifications/push-registration-session";
import { readAuthenticatedUserIdentity } from "@/lib/user-session";

export function pushJson(body: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function pushDenied(): NextResponse {
  return pushJson({ error: "Browser alerts are not available for this session." }, 403);
}

export async function requirePushRegistrationUserId(): Promise<string | null> {
  const identity = await readAuthenticatedUserIdentity();
  if (!identity.ok) return null;
  return pushRegistrationUserId(identity.identity.session);
}

export async function requirePushReleaseSession(): Promise<{ userId: string | null } | null> {
  const session = await getAppSession();
  if (!canReleaseBrowserPush(session)) return null;
  return { userId: pushRegistrationUserId(session) };
}

export async function readEndpointBody(request: Request): Promise<{ endpoint: string } | null> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return null;
  const endpoint = (body as { endpoint?: unknown }).endpoint;
  if (typeof endpoint !== "string") return null;
  return { endpoint };
}

export async function readSubscriptionBody(
  request: Request,
): Promise<{ endpoint: string; p256dh: string; auth: string } | null> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return null;
  const record = body as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof record.endpoint !== "string") return null;
  if (!record.keys || typeof record.keys.p256dh !== "string" || typeof record.keys.auth !== "string") return null;
  return { endpoint: record.endpoint, p256dh: record.keys.p256dh, auth: record.keys.auth };
}

export function pushFailure(error: unknown): NextResponse {
  if (error instanceof PushSubscriptionError) {
    return pushJson({ error: error.message }, error.code === "INVALID" ? 400 : 403);
  }
  return pushJson({ error: "Browser alerts are not available right now." }, 500);
}
