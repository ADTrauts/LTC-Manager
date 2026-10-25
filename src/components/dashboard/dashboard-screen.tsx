import { Suspense } from "react";
import Link from "next/link";

import { DashboardEditor, type DashboardEditorCard } from "@/components/dashboard/dashboard-editor";
import { DashboardSettleReporter } from "@/components/dashboard/dashboard-settle";

import { listEligibleCards, type EligibleDashboardCard } from "@/lib/dashboard/cards/eligibility";
import type { CardSize, DashboardMetric, DashboardReadyModel, DashboardSummaryModel } from "@/lib/dashboard/cards/types";
import { resolveDepartmentDashboardCapabilities } from "@/lib/dashboard/capabilities";
import { dashboardHrefForViewer, isDashboardHrefAuthorized } from "@/lib/dashboard/drill-down";
import { createDashboardFactPack, type DashboardFactPack } from "@/lib/dashboard/facts";
import { defaultLayoutFor, placeDashboardCards } from "@/lib/dashboard/layouts/defaults";
import {
  chooseDashboardLayout,
  facilityDefaultBandLabel,
  facilityDefaultBands,
} from "@/lib/dashboard/layouts/facility-default";
import { loadFacilityDashboardDefault, loadPersonalDashboardLayout } from "@/lib/dashboard/layouts/store";
import { isFacilityAdministratorRole } from "@/lib/facility-admin";
import { dashboardEditHref, dashboardScopeChoiceLabel, dashboardScopeHref, dashboardScopeParam } from "@/lib/dashboard/lens";
import { prisma } from "@/lib/prisma";
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

function DashboardGridStyles() {
  return (
    <style href="dashboard-grid">{`
      .dashboard-grid {
        display: grid;
        gap: 1rem;
        grid-auto-rows: minmax(7.5rem, auto);
        grid-template-columns: minmax(0, 1fr);
      }
      .dashboard-grid > article { grid-column: 1 / -1; }
      @media (min-width: 960px) {
        .dashboard-grid { grid-template-columns: repeat(12, minmax(0, 1fr)); }
        .dashboard-grid > article[data-size="S"] { grid-column: span 3; }
        .dashboard-grid > article[data-size="M"] { grid-column: span 6; }
        .dashboard-grid > article[data-size="L"] { grid-column: span 12; }
      }
    `}</style>
  );
}

function rowMinHeight(rows: 1 | 2 | 3): string {
  return `calc(${rows} * 7.5rem + ${rows - 1} * 1rem)`;
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

type CardView = {
  state: "ready" | "quiet" | "not_configured" | "unavailable";
  message: string;
  metrics: readonly DashboardMetric[];
  lines: DashboardReadyModel["lines"];
  headerHref: string | null;
};

async function loadCardView({
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
}): Promise<CardView> {
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
          href: item.href && isDashboardHrefAuthorized(viewer, item.href) ? dashboardHrefForViewer(viewer, item.href) : null,
        }));
  const headerHref = eligible.drillDown?.href ? dashboardHrefForViewer(viewer, eligible.drillDown.href) : null;
  return { state, message, metrics: shownMetrics, lines: shownLines, headerHref };
}

function CardMarkup({ view, title }: { view: CardView; title: string }) {
  return (
    <>
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      {view.state === "ready" ? (
        <>
          <Metrics metrics={view.metrics} />
          {view.lines.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {view.lines.map((item) => (
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
        <p className="mt-1 text-sm text-zinc-600">{view.message}</p>
      )}
      {view.headerHref ? (
        <Link href={view.headerHref} className="mt-3 inline-block text-sm underline-offset-2 hover:underline">
          Open
        </Link>
      ) : null}
    </>
  );
}

async function DashboardCardBody({
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
  const view = await loadCardView({ viewer, facts, eligible, size, faultCardId });
  return <CardMarkup view={view} title={eligible.card.title} />;
}

async function DashboardCardFrame({
  viewer,
  facts,
  eligible,
  size,
  rows,
  faultCardId,
}: {
  viewer: DashboardViewer;
  facts: DashboardFactPack;
  eligible: EligibleDashboardCard;
  size: CardSize;
  rows: 1 | 2 | 3;
  faultCardId: string | null;
}) {
  const view = await loadCardView({ viewer, facts, eligible, size, faultCardId });
  return (
    <article
      className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4"
      style={{ gridRow: `span ${rows}`, minHeight: rowMinHeight(rows) }}
      data-testid={`dashboard-card-${eligible.card.id}`}
      data-state={view.state}
      data-size={size}
      data-rows={String(rows)}
    >
      <CardMarkup view={view} title={eligible.card.title} />
    </article>
  );
}

export async function DashboardScreen({
  viewer,
  onboardingComplete,
  faultCardId = null,
  editing = false,
  homePath = "/dashboard",
}: {
  viewer: DashboardViewer;
  onboardingComplete: boolean;
  faultCardId?: string | null;
  editing?: boolean;
  /** Lens and Arrange stay on this path. Partner sessions use `/partner`. */
  homePath?: string;
}) {
  const capabilities = await resolveDepartmentDashboardCapabilities(viewer);
  const facts = createDashboardFactPack(viewer, {
    resolveDepartmentDashboardCapabilities: async () => capabilities,
  });
  const eligible = listEligibleCards(viewer, capabilities);
  const stored =
    viewer.layoutOwner && viewer.scope
      ? await loadPersonalDashboardLayout(prisma, {
          facilityId: viewer.facilityId,
          owner: viewer.layoutOwner,
          scopeKind: viewer.scope.kind,
        })
      : null;
  const facilityDefault =
    stored === null && viewer.scope
      ? await loadFacilityDashboardDefault(prisma, {
          facilityId: viewer.facilityId,
          authority: viewer.authority,
          scopeKind: viewer.scope.kind,
        })
      : null;
  const chosen = chooseDashboardLayout(stored, facilityDefault);
  const layout = chosen
    ? chosen.map((item) => ({ id: item.card, size: item.size, rows: item.rows }))
    : defaultLayoutFor(viewer);
  const cards = placeDashboardCards(eligible, layout);
  const currentScope = viewer.scope ? dashboardScopeParam(viewer.scope) : null;
  const returnHref = viewer.scope ? dashboardScopeHref(viewer.scope, onboardingComplete, homePath) : homePath;
  const editorItems: DashboardEditorCard[] = cards.map((placed) => ({
    card: placed.eligible.card.id,
    title: placed.eligible.card.title,
    category: placed.eligible.card.category,
    sizes: placed.eligible.card.sizes,
    size: placed.size,
    rows: placed.rows,
  }));
  const placedIds = new Set(editorItems.map((item) => item.card));
  const library = eligible
    .filter((item) => !placedIds.has(item.card.id))
    .map((item) => ({
      card: item.card.id,
      title: item.card.title,
      category: item.card.category,
      sizes: item.card.sizes,
    }));
  const editorPreviews = [
    ...cards.map((placed) => ({ eligible: placed.eligible, size: placed.size })),
    ...eligible
      .filter((item) => !placedIds.has(item.card.id))
      .map((item) => ({
        eligible: item,
        size: item.card.sizes.includes("M") ? ("M" as const) : (item.card.sizes[0] ?? "M"),
      })),
  ];
  return (
    <section className="mx-auto max-w-6xl space-y-4" data-testid="dashboard-v2">
      <DashboardGridStyles />
      {onboardingComplete ? <OnboardingLaunchChecklist /> : null}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-600" data-testid="dashboard-scope">
            {scopeLabel(viewer)}
          </p>
        </div>
        <div className="flex gap-2">
          {viewer.canCustomize && viewer.scope && !editing ? (
            <Link
              href={dashboardEditHref(viewer.scope, onboardingComplete, homePath)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-800"
            >
              Arrange
            </Link>
          ) : null}
          <form>
            <button type="submit" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-800">
              Refresh
            </button>
          </form>
        </div>
      </div>
      {viewer.availableScopes.length > 1 ? (
        <nav className="flex flex-wrap gap-2" aria-label="Dashboard lens" data-testid="dashboard-lens">
          {viewer.availableScopes.map((scope) => {
            const param = dashboardScopeParam(scope);
            const current = param === currentScope;
            return (
              <Link
                key={param}
                href={dashboardScopeHref(scope, onboardingComplete, homePath)}
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
      <DashboardSettleReporter cardCount={editing ? 0 : cards.length} scope={currentScope} />
      {editing && viewer.canCustomize && viewer.scope ? (
        <DashboardEditor
          scopeKind={viewer.scope.kind}
          scope={currentScope ?? ""}
          returnHref={returnHref}
          items={editorItems}
          library={library}
          facilityDefaultBands={
            isFacilityAdministratorRole(viewer.role)
              ? facilityDefaultBands(viewer.scope.kind).map((authority) => ({
                  authority,
                  label: facilityDefaultBandLabel(authority),
                }))
              : []
          }
          defaultAuthority={viewer.authority}
        >
          {editorPreviews.map((placed) => (
            <div key={placed.eligible.card.id} data-card={placed.eligible.card.id} className="p-4">
              <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
                <DashboardCardBody
                  viewer={viewer}
                  facts={facts}
                  eligible={placed.eligible}
                  size={placed.size}
                  faultCardId={faultCardId}
                />
              </Suspense>
            </div>
          ))}
        </DashboardEditor>
      ) : cards.length === 0 ? (
        <p className="text-sm text-zinc-600">Nothing on this Dashboard yet.</p>
      ) : (
        <div className="dashboard-grid">
          {cards.map((placed) => (
            <Suspense
              key={placed.eligible.card.id}
              fallback={
                <article
                  className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500"
                  style={{
                    gridRow: `span ${placed.rows}`,
                    minHeight: rowMinHeight(placed.rows),
                  }}
                  data-size={placed.size}
                >
                  Loading…
                </article>
              }
            >
              <DashboardCardFrame
                viewer={viewer}
                facts={facts}
                eligible={placed.eligible}
                size={placed.size}
                rows={placed.rows}
                faultCardId={faultCardId}
              />
            </Suspense>
          ))}
        </div>
      )}
    </section>
  );
}
