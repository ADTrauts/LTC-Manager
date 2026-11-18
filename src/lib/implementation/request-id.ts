/** A retry identifier is not a credential. Store only it, scoped to actor and Facility. */
export function isImplementationRequestId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export const implementationRequestStorageKey = (actorId: string, facilityId: string) =>
  `vssyl.implementation-request/1/${actorId}/${facilityId}`;
