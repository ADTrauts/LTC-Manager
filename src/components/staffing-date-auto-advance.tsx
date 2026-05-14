"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

function toIsoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function StaffingDateAutoAdvance({
  selectedDateIso,
}: {
  selectedDateIso: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const now = new Date();
    const todayIso = toIsoDate(now);
    if (selectedDateIso !== todayIso) return;

    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const msUntilNextMidnight = Math.max(nextMidnight.getTime() - now.getTime(), 1);

    const timer = window.setTimeout(() => {
      const nextIso = toIsoDate(new Date());
      router.replace(`/staffing?date=${nextIso}`);
      router.refresh();
    }, msUntilNextMidnight);

    return () => window.clearTimeout(timer);
  }, [router, selectedDateIso]);

  return null;
}
