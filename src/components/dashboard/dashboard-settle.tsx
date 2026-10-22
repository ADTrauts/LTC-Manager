"use client";

import { useEffect, useRef } from "react";

import { recordDashboardSettle } from "@/app/(protected)/dashboard/settle-action";
import { dashboardSettleElapsedMs } from "@/lib/dashboard/settle";

export function DashboardSettleReporter({
  cardCount,
  scope,
}: {
  cardCount: number;
  scope: string | null;
}) {
  const sent = useRef(false);

  useEffect(() => {
    const root = document.querySelector("[data-testid='dashboard-v2']");
    if (!root) return;
    const token = `${scope ?? "none"}:${cardCount}`;
    if (root.getAttribute("data-settle-token") === token) return;
    sent.current = false;
    root.removeAttribute("data-settle-ms");
    const mountedAtMs = performance.now();

    const report = () => {
      if (sent.current) return;
      const articles = [...root.querySelectorAll("article")];
      if (
        cardCount > 0 &&
        (articles.length < cardCount || articles.some((article) => !article.hasAttribute("data-state")))
      ) {
        return;
      }
      sent.current = true;
      const elapsedMs = dashboardSettleElapsedMs({ nowMs: performance.now(), mountedAtMs });
      root.setAttribute("data-settle-token", token);
      root.setAttribute("data-settle-ms", String(elapsedMs));
      void recordDashboardSettle({ elapsedMs, cardCount, scope });
    };

    const observer = new MutationObserver(report);
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state"] });
    report();
    return () => observer.disconnect();
  }, [cardCount, scope]);

  return null;
}
