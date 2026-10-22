import { Suspense } from "react";
import Link from "next/link";

import { DashboardSettleReporter } from "@/components/dashboard/dashboard-settle";

import { listEligibleCards, type EligibleDashboardCard } from "@/lib/dashboard/cards/eligibility";
import type { CardSize, DashboardMetric, DashboardReadyModel, DashboardSummaryModel } from "@/lib/dashboard/cards/types";
import { resolveDepartmentDashboardCapabilities } from "@/lib/dashboard/capabilities";
import { isDashboardHrefAuthorized } from "@/lib/dashboard/drill-down";
import { createDashboardFactPack, type DashboardFactPack } from "@/lib/dashboard/facts";
import { defaultLayoutFor, placeDashboardCards } from "@/lib/dashboard/layouts/defaults";
import { dashboardScopeChoiceLabel, dashboardScopeHref, dashboardScopeParam } from "@/lib/dashboard/lens";
import type { DashboardViewer } from "@/lib/dashboard/viewer/types";

function scopeLabel(viewer: DashboardViewer): string {
  const scope = viewer.scope;
  if (!scope) return "No Department";
  if (scope.kind === "FACILITY") return "Facility";
  const name = viewer.departments.find((department) => department.id === scope.departmentId)?.name ?? "Department";
  return scope.kind === "TEAM" ? `Team · ${name}` : name;
}

function OnboardingLaunchChecklist() {
  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <h2 className="text-lg font-semibold text-emerald-900">Setup complete</h2>
      <p className="mt-1 text-sm text-emerald-800">Your workspace is ready. Use this checklist to finish launch tasks.</p>
      <ul className="mt-3 space-y-1 text-sm text-emerald-900">
        <li>
          Add managers in{" "}
          <Link href="/employees" className="font-medium underline">
            Employees
          </Link>
          .
        </li>
        <li>Confirm locations and serving units in Locations.</li>
        <li>Assign route permissions for each role in Administration.</li>
      </ul>
    </section>
  );
}

const TONE_CLASS = {
  ok: "text-emerald-800",
  attention: "text-amber-800",
  late: "text-red-800",
} as const;

function lineLimit(size: CardSize): number {
  if (size === "S") return 0;
  if (size === "M") return 5;
  return 10;
}

function spanClass(size: CardSize): string {
  if (size === "S") return "xl:col-span-3";
  if (size === "M") return "xl:col-span-6";
  return "xl:col-span-12";
}

function Metrics({ metrics }: { metrics: readonly DashboardMetric[] }) {
  if (metrics.length === 0) return null;
  return (
    <dl className="mt-3 flex flex-wrap gap-4">
      {metrics.map((item) => (
        <div key={item.label}>
          <dt className="text-xs text-zinc-500">{item.label}</dt>
          <dd className={`text-lg font-semibold ${TONE_CLASS[item.tone]}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

async function DashboardCardFrame({
  viewer,
  facts,
  eligible,
  size,
  faultCardId,
}: {
  viewer: DashboardViewer;
  facts: DashboardFactPack;
  eligible: EligibleDashboardCard;
  size: CardSize;
  faultCardId: string | null;
}) {
  let state: "ready" | "quiet" | "not_configured" | "unavailable" = "unavailable";
  let message = "This card could not be loaded.";
  let metrics: readonly DashboardMetric[] = [];
  let lines: DashboardReadyModel["lines"] = [];
  try {
    if (faultCardId === eligible.card.id) {
      throw new Error("Dashboard card fault injection");
    }
    if (eligible.form === "not_configured" && eligible.notConfigured) {
      state = "not_configured";
      message = eligible.notConfigured.message;
    } else if (eligible.form === "summary" && eligible.card.summary) {
      const result = await eligible.card.summary.load({ viewer, facts, size });
      if (result.state === "ready") {
        state = "ready";
        metrics = result.model.metrics;
      } else if (result.state === "quiet") {
        state = "quiet";
        message = result.message;
      } else if (result.state === "not_configured") {
        state = "not_configured";
        message = result.reason.message;
      }
    } else {
      const result = await eligible.card.load({ viewer, facts, size });
      if (result.state === "ready") {
        state = "ready";
        const model = result.model as DashboardReadyModel | DashboardSummaryModel;
        metrics = model.metrics;
        lines = "lines" in model ? model.lines : [];
      } else if (result.state === "quiet") {
        state = "quiet";
        message = result.message;
      } else if (result.state === "not_configured") {
        state = "not_configured";
        message = result.reason.message;
      }
    }
  } catch {
    state = "unavailable";
    message = "This card could not be loaded.";
  }
  const shownMetrics = eligible.form === "summary" || size !== "S" ? metrics : metrics.slice(0, 1);
  const shownLines =
    eligible.accessMode === "SUMMARY"
      ? []
      : lines.slice(0, lineLimit(size)).map((item) => ({
          ...item,
          href: item.href && isDashboardHrefAuthorized(viewer, item.href) ? item.href : null,
        }));
  const headerHref = eligible.drillDown?.href ?? null;
  return (
    <article
      className={`rounded-xl border border-zinc-200 bg-white p-4 ${spanClass(size)}`}
      data-testid={`dashboard-card-${eligible.card.id}`}
      data-state={state}
      data-size={size}
    >
      <h2 className="text-sm font-semibold text-zinc-900">{eligible.card.title}</h2>
      {state === "ready" ? (
        <>
          <Metrics metrics={shownMetrics} />
          {shownLines.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {shownLines.map((item) => (
                <li key={item.id} className="text-sm">
                  {item.href ? (
                    <Link href={item.href} className="underline-offset-2 hover:underline">
                      {item.title}
                    </Link>
                  ) : (
                    <span className="text-zinc-900">{item.title}</span>
                  )}
                  {item.detail ? <p className="text-zinc-600">{item.detail}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="mt-1 text-sm text-zinc-600">{message}</p>
      )}
      {headerHref ? (
        <Link href={headerHref} className="mt-3 inline-block text-sm underline-offset-2 hover:underline">
          Open
        </Link>
      ) : null}
    </article>
  );
}

export async function DashboardScreen({
  viewer,
  onboardingComplete,
  faultCardId = null,
}: {
  viewer: DashboardViewer;
  onboardingComplete: boolean;
  faultCardId?: string | null;
}) {
  const facts = createDashboardFactPack(viewer);
  const capabilities = await resolveDepartmentDashboardCapabilities(viewer);
  const cards = placeDashboardCards(listEligibleCards(viewer, capabilities), defaultLayoutFor(viewer));
  const currentScope = viewer.scope ? dashboardScopeParam(viewer.scope) : null;
  return (
    <section className="mx-auto max-w-6xl space-y-4" data-testid="dashboard-v2">
      {onboardingComplete ? <OnboardingLaunchChecklist /> : null}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-600" data-testid="dashboard-scope">
            {scopeLabel(viewer)}
          </p>
        </div>
        <form>
          <button type="submit" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-800">
            Refresh
          </button>
        </form>
      </div>
      {viewer.availableScopes.length > 1 ? (
        <nav className="flex flex-wrap gap-2" aria-label="Dashboard lens" data-testid="dashboard-lens">
          {viewer.availableScopes.map((scope) => {
            const param = dashboardScopeParam(scope);
            const current = param === currentScope;
            return (
              <Link
                key={param}
                href={dashboardScopeHref(scope, onboardingComplete)}
                aria-current={current ? "page" : undefined}
                data-testid={`dashboard-lens-${param}`}
                className={`rounded-md border px-3 py-1.5 text-sm ${current ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 text-zinc-800"}`}
              >
                {dashboardScopeChoiceLabel(scope, viewer.departments)}
              </Link>
            );
          })}
        </nav>
      ) : null}
      {viewer.notices.map((notice) => (
        <p key={notice.code} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
          {notice.message}
        </p>
      ))}
      <DashboardSettleReporter cardCount={cards.length} scope={currentScope} />
      {cards.length === 0 ? (
        <p className="text-sm text-zinc-600">Nothing on this Dashboard yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          {cards.map((placed) => (
            <Suspense
              key={placed.eligible.card.id}
              fallback={
                <article className={`rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500 ${spanClass(placed.size)}`}>
                  Loading…
                </article>
              }
            >
              <DashboardCardFrame
                viewer={viewer}
                facts={facts}
                eligible={placed.eligible}
                size={placed.size}
                faultCardId={faultCardId}
              />
            </Suspense>
          ))}
        </div>
      )}
    </section>
  );
}
