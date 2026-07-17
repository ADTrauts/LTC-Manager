/**
 * Wave 15D — request-scoped Projection memoization.
 *
 * L0 only: identical requests within one memo instance share one resolve.
 * No Redis, persistence, background refresh, or invalidation framework.
 */

import type { ProjectionRequest } from "./types";

export function projectionRequestMemoKey(request: ProjectionRequest): string {
  const focus =
    request.focus == null
      ? ""
      : request.focus.kind === "FACILITY"
        ? `facility:${request.focus.facilityId}`
        : request.focus.kind === "UNIT"
          ? `unit:${request.focus.unitId}`
          : `space:${request.focus.spaceId}`;
  const lens =
    request.lens.mode === "FACILITY"
      ? "facility"
      : `department:${request.lens.departmentId}:${request.lens.departmentKey}`;

  return [
    request.facilityId,
    lens,
    request.purpose,
    request.accessClass.key,
    request.operationContextKey ?? "",
    request.asOf ?? "",
    focus,
  ].join("|");
}

export type ProjectionRuntimeMemo<T> = {
  getOrCreate: (request: ProjectionRequest, factory: () => Promise<T>) => Promise<T>;
  size: () => number;
  clear: () => void;
};

export function createProjectionRuntimeMemo<T>(): ProjectionRuntimeMemo<T> {
  const cache = new Map<string, Promise<T>>();

  return {
    getOrCreate(request, factory) {
      const key = projectionRequestMemoKey(request);
      const existing = cache.get(key);
      if (existing) return existing;
      const created = factory();
      cache.set(key, created);
      return created;
    },
    size: () => cache.size,
    clear: () => {
      cache.clear();
    },
  };
}
