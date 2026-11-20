import type { PublicKeyCredentialRequestOptionsJSON, PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";

export type AssertionCeremony = { challengeId: string; options: PublicKeyCredentialRequestOptionsJSON };
export type EnrollmentCeremony = { challengeId: string; options: PublicKeyCredentialCreationOptionsJSON };

export async function staffPost<T = { ok: boolean }>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, { method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) throw new Error(payload?.error ?? "The request could not be completed.");
  return payload as T;
}

export async function runStaffCommand(command: Record<string, unknown>) {
  const path = "/api/console/staff-lifecycle";
  const ceremony = await staffPost<AssertionCeremony>(path, { operation: "begin", command });
  const { startAuthentication } = await import("@simplewebauthn/browser");
  const response = await startAuthentication({ optionsJSON: ceremony.options });
  return staffPost(path, { operation: "execute", challengeId: ceremony.challengeId, response });
}
