"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  departmentIdFromBuilderWorkspacePath,
  shouldSyncActiveDepartmentFromRoute,
} from "@/lib/active-department-navigation";

type Props = {
  selectedDepartmentId: string | null;
  selectableDepartmentIds: string[];
};

/**
 * When a department-scoped Builder URL is open, keep `ltc_active_department` (and therefore
 * the header selector) aligned with that route. Covers deep links and back/forward.
 */
export function ActiveDepartmentRouteSync({
  selectedDepartmentId,
  selectableDepartmentIds,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const inFlight = useRef<string | null>(null);

  useEffect(() => {
    const routeDepartmentId = departmentIdFromBuilderWorkspacePath(pathname);
    if (
      !shouldSyncActiveDepartmentFromRoute({
        routeDepartmentId,
        selectedDepartmentId,
        selectableDepartmentIds,
      })
    ) {
      inFlight.current = null;
      return;
    }

    const nextId = routeDepartmentId!;
    if (inFlight.current === nextId) return;
    inFlight.current = nextId;

    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/auth/active-department", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: nextId }),
      });
      if (cancelled) return;
      if (!res.ok) {
        inFlight.current = null;
        return;
      }
      router.refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, selectedDepartmentId, selectableDepartmentIds, router]);

  return null;
}
