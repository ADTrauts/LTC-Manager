import type { OfflineRuntimeBundle } from "./types";

export function isBundleExpired(bundle: OfflineRuntimeBundle, now = new Date()): boolean {
  return new Date(bundle.offlineAuthorizedUntil).getTime() <= now.getTime();
}

export function bundleMatchesScope(input: {
  bundle: OfflineRuntimeBundle;
  facilityId: string;
  unitId: string;
  actorRef: string;
  sessionVersion: number;
  deviceFacilityId: string;
  deviceBoundUnitId: string | null;
}): { ok: true } | { ok: false; reason: string } {
  const { bundle } = input;
  if (bundle.facilityId !== input.facilityId) return { ok: false, reason: "FACILITY_MISMATCH" };
  if (bundle.unitId !== input.unitId) return { ok: false, reason: "UNIT_MISMATCH" };
  if (bundle.actor.actorRef !== input.actorRef) return { ok: false, reason: "ACTOR_MISMATCH" };
  if (bundle.actor.sessionVersion !== input.sessionVersion) return { ok: false, reason: "SESSION_VERSION_MISMATCH" };
  if (bundle.deviceFacilityId !== input.deviceFacilityId) return { ok: false, reason: "DEVICE_FACILITY_MISMATCH" };
  if ((bundle.deviceBoundUnitId ?? null) !== (input.deviceBoundUnitId ?? null)) {
    return { ok: false, reason: "DEVICE_UNIT_MISMATCH" };
  }
  return { ok: true };
}

export function validateBundleForOfflineCommand(input: {
  bundle: OfflineRuntimeBundle | null;
  facilityId: string;
  unitId: string;
  actorRef: string;
  sessionVersion: number;
  deviceFacilityId: string;
  deviceBoundUnitId: string | null;
  deviceRevokedLocally?: boolean;
  signedOut?: boolean;
  now?: Date;
}): { ok: true; bundle: OfflineRuntimeBundle } | { ok: false; reason: string } {
  if (input.signedOut) return { ok: false, reason: "SIGNED_OUT" };
  if (input.deviceRevokedLocally) return { ok: false, reason: "DEVICE_REVOKED" };
  if (!input.bundle) return { ok: false, reason: "NO_BUNDLE" };
  if (isBundleExpired(input.bundle, input.now)) return { ok: false, reason: "BUNDLE_EXPIRED" };
  const scope = bundleMatchesScope({
    bundle: input.bundle,
    facilityId: input.facilityId,
    unitId: input.unitId,
    actorRef: input.actorRef,
    sessionVersion: input.sessionVersion,
    deviceFacilityId: input.deviceFacilityId,
    deviceBoundUnitId: input.deviceBoundUnitId,
  });
  if (!scope.ok) return scope;
  return { ok: true, bundle: input.bundle };
}
