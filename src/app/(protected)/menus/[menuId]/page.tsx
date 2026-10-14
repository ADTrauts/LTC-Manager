import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BuildPageHeader } from "@/components/build/build-breadcrumb";
import { MenuApplicabilityForm } from "@/components/menus/menu-applicability-form";
import { MenuDayBuilder } from "@/components/menus/menu-day-builder";
import { MenuLivePreview } from "@/components/menus/menu-live-preview";
import { MenuOverviewForm } from "@/components/menus/menu-overview-form";
import { requireFacilitySession } from "@/lib/facility-context";
import {
  bindPeriodsToCycles,
  evaluateMenuApplicabilityAttention,
  menuApplicabilitySummary,
  resolveMenuPeriodKeys,
} from "@/lib/menu-applicability";
import {
  loadDepartmentMenuLocations,
  loadEligibleMenuOperationalCycles,
  loadMenuApplicability,
  loadMenuApplicabilityPeers,
} from "@/lib/menu-applicability-db";
import { dayLabelsForWeekStart, ensureMenuSettingsDefaults } from "@/lib/menu-cycle";
import { loadMenu } from "@/lib/menu-db";
import { prisma } from "@/lib/prisma";

type MenuDetailPageProps = {
  params: Promise<{ menuId: string }>;
  searchParams?: Promise<{ tab?: string; week?: string; day?: string }>;
};

function editorTabClass(active: boolean): string {
  return active
    ? "rounded px-2.5 py-1 text-sm font-medium bg-zinc-900 text-white"
    : "rounded px-2.5 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-100";
}

export default async function MenuDetailPage({ params, searchParams }: MenuDetailPageProps) {
  noStore();
  const session = await requireFacilitySession();
  const { menuId } = await params;
  const query = searchParams ? await searchParams : undefined;
  const tab =
    query?.tab === "overview" ? "overview" : query?.tab === "applicability" ? "applicability" : "menu";

  const loaded = await loadMenu(prisma, {
    menuId,
    facilityId: session.facilityId,
    menuItemsOrderBy: [{ weekNumber: "asc" }, { dayIndex: "asc" }, { mealPeriodKey: "asc" }, { displayOrder: "asc" }],
  });
  if (!loaded.menu && !loaded.unavailableReason) {
    notFound();
  }
  if (!loaded.menu) {
    return (
      <section className="space-y-4">
        <BuildPageHeader title="Menu" subtitle="This menu could not be loaded." />
        <div className="max-w-3xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {loaded.unavailableReason}
        </div>
        <Link href="/menus" className="text-sm font-medium text-zinc-900 underline underline-offset-2">
          Back to menus
        </Link>
      </section>
    );
  }

  const menu = loaded.menu;
  const [applicability, departmentLocations, eligibleCycles, peers] = await Promise.all([
    loadMenuApplicability(prisma, menu.id),
    loadDepartmentMenuLocations({
      facilityId: session.facilityId,
      departmentId: menu.departmentId,
    }),
    loadEligibleMenuOperationalCycles({
      facilityId: session.facilityId,
      departmentId: menu.departmentId,
    }),
    loadMenuApplicabilityPeers(prisma, {
      facilityId: session.facilityId,
      departmentId: menu.departmentId,
      excludeMenuId: menu.id,
    }),
  ]);
  const periodKeys = resolveMenuPeriodKeys(loaded.settingsRaw?.periodConfigJson);
  const attention = evaluateMenuApplicabilityAttention({
    status: menu.status,
    locations: applicability.locations,
    cycles: applicability.cycles,
    actionable: departmentLocations?.locations ?? [],
    eligible: eligibleCycles,
    periodKeys,
    peers,
    menuId: menu.id,
  });
  const summary = menuApplicabilitySummary({
    locations: applicability.locations,
    cycles: applicability.cycles,
    eligible: eligibleCycles,
  });
  const settings = ensureMenuSettingsDefaults(loaded.settingsRaw);
  const periods = bindPeriodsToCycles(settings.periods, applicability.cycles);
  const requestedWeek = Number.parseInt(query?.week ?? "", 10);
  const selectedWeek =
    Number.isFinite(requestedWeek) && requestedWeek >= 1 && requestedWeek <= settings.cycleLengthWeeks
      ? requestedWeek
      : 1;
  const dayLabels = dayLabelsForWeekStart(settings.weekStartsOn);
  const requestedDay = Number.parseInt(query?.day ?? "", 10);
  const selectedDayIndex = Number.isFinite(requestedDay) && requestedDay >= 0 && requestedDay <= 6 ? requestedDay : 0;
  const unavailable = Boolean(loaded.unavailableReason);
  const statusLabel = menu.status === "ACTIVE" ? "Active" : "Inactive";

  return (
    <section className="space-y-3">
      <header className="border-b border-zinc-200 pb-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{menu.name}</h1>
          <p className="text-sm text-zinc-500">
            {menu.department.name} · {statusLabel}
          </p>
        </div>
        <nav className="mt-1.5 flex flex-wrap gap-1" aria-label="Menu sections">
          <a
            href={`/menus/${menu.id}?tab=overview`}
            className={editorTabClass(tab === "overview")}
            aria-current={tab === "overview" ? "page" : undefined}
          >
            Overview
          </a>
          <a
            href={`/menus/${menu.id}?tab=menu&week=${selectedWeek}&day=${selectedDayIndex}`}
            className={editorTabClass(tab === "menu")}
            aria-current={tab === "menu" ? "page" : undefined}
          >
            Menu
          </a>
          <a
            href={`/menus/${menu.id}?tab=applicability`}
            className={editorTabClass(tab === "applicability")}
            aria-current={tab === "applicability" ? "page" : undefined}
          >
            Locations
          </a>
        </nav>
      </header>
      {loaded.unavailableReason ? (
        <div className="max-w-3xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {loaded.unavailableReason}
        </div>
      ) : null}

      {tab === "overview" ? (
        <article className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
          <MenuOverviewForm
            menuId={menu.id}
            name={menu.name}
            status={menu.status}
            departmentName={menu.department.name}
            updatedAt={menu.updatedAt}
            cycleLengthWeeks={settings.cycleLengthWeeks}
            weekStartsOn={settings.weekStartsOn}
            cycleAnchorDate={settings.cycleAnchorDate.toISOString().slice(0, 10)}
            periods={periods}
            locationSummary={`${summary.locationCount} location${summary.locationCount === 1 ? "" : "s"}${
              summary.cycleLabels.length > 0
                ? ` · ${summary.cycleLabels.join(", ")}`
                : " · No Operational Cycles yet"
            }`}
            attentionCount={attention.length}
            disabled={unavailable}
          />
        </article>
      ) : null}

      {tab === "applicability" ? (
        <article className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
          <MenuApplicabilityForm
            menuId={menu.id}
            locations={departmentLocations?.locations ?? []}
            locationHierarchy={departmentLocations?.locationHierarchy ?? []}
            floorLabel={departmentLocations?.vocabulary.level1.singular ?? "Floor"}
            neighborhoodLabel={departmentLocations?.vocabulary.level2.singular ?? "Neighborhood"}
            selectedLocations={applicability.locations}
            selectedCycles={applicability.cycles}
            attention={attention}
            disabled={unavailable}
          />
        </article>
      ) : null}

      {tab === "menu" ? (
          <article className="rounded-xl border border-zinc-200 bg-zinc-100 p-3 shadow-sm">
            <fieldset disabled={unavailable} className="min-w-0 border-0 p-0">
              <legend className="sr-only">Menu cycle by week and day</legend>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 rounded-lg bg-white p-1">
                  {Array.from({ length: settings.cycleLengthWeeks }, (_, idx) => idx + 1).map((week) => (
                    <a
                      key={week}
                      href={`/menus/${menu.id}?tab=menu&week=${week}&day=${selectedDayIndex}`}
                      className={editorTabClass(selectedWeek === week)}
                    >
                      Week {week}
                    </a>
                  ))}
                </div>
                <MenuLivePreview
                  menuName={menu.name}
                  cycleLengthWeeks={settings.cycleLengthWeeks}
                  dayLabels={dayLabels}
                  initialWeek={selectedWeek}
                  initialDayIndex={selectedDayIndex}
                  periods={periods}
                  menuItems={loaded.menuItems}
                  unavailable={unavailable}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1 rounded-lg bg-white p-1">
                {dayLabels.map((dayLabel, dayIndex) => (
                  <a
                    key={`${dayLabel}-${dayIndex}`}
                    href={`/menus/${menu.id}?tab=menu&week=${selectedWeek}&day=${dayIndex}`}
                    className={editorTabClass(selectedDayIndex === dayIndex)}
                    aria-current={selectedDayIndex === dayIndex ? "page" : undefined}
                  >
                    {dayLabel}
                  </a>
                ))}
              </div>
              <div className="mt-3">
                <MenuDayBuilder
                  key={`${menu.id}-${selectedWeek}-${selectedDayIndex}`}
                  menuId={menu.id}
                  selectedWeek={selectedWeek}
                  selectedDayIndex={selectedDayIndex}
                  cycleLengthWeeks={settings.cycleLengthWeeks}
                  weekStartsOn={settings.weekStartsOn}
                  cycleAnchorDate={settings.cycleAnchorDate.toISOString().slice(0, 10)}
                  periods={periods}
                  eligibleCycles={eligibleCycles}
                  menuItems={loaded.menuItems}
                  disabled={unavailable}
                />
              </div>
            </fieldset>
          </article>
      ) : null}
    </section>
  );
}
