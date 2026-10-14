import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BuildPageHeader } from "@/components/build/build-breadcrumb";
import { MenuApplicabilityForm } from "@/components/menus/menu-applicability-form";
import { MenuDayBuilder } from "@/components/menus/menu-day-builder";
import { MenuIdentityForm } from "@/components/menus/menu-identity-form";
import { MenuPeriodSettingsForm } from "@/components/menus/menu-period-settings-form";
import { requireFacilitySession } from "@/lib/facility-context";
import {
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
import { dayLabelsForWeekStart, ensureMenuSettingsDefaults, menuForCycleSlot, menuForDate } from "@/lib/menu-cycle";
import { loadMenu } from "@/lib/menu-db";
import { prisma } from "@/lib/prisma";

type MenuDetailPageProps = {
  params: Promise<{ menuId: string }>;
  searchParams?: Promise<{ tab?: string; week?: string; day?: string }>;
};

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
  const requestedWeek = Number.parseInt(query?.week ?? "", 10);
  const selectedWeek =
    Number.isFinite(requestedWeek) && requestedWeek >= 1 && requestedWeek <= settings.cycleLengthWeeks
      ? requestedWeek
      : 1;
  const dayLabels = dayLabelsForWeekStart(settings.weekStartsOn);
  const requestedDay = Number.parseInt(query?.day ?? "", 10);
  const selectedDayIndex = Number.isFinite(requestedDay) && requestedDay >= 0 && requestedDay <= 6 ? requestedDay : 0;
  const unavailable = Boolean(loaded.unavailableReason);
  const todayMenu = menuForDate({
    date: new Date(),
    settings,
    periods: settings.periods,
    menuItems: loaded.menuItems,
  });
  const selectedDayMenu = menuForCycleSlot({
    weekNumber: selectedWeek,
    dayIndex: selectedDayIndex,
    periods: settings.periods,
    menuItems: loaded.menuItems,
  });
  const statusLabel = menu.status === "ACTIVE" ? "Active" : "Inactive";

  return (
    <section className="space-y-4">
      <BuildPageHeader
        title={menu.name}
        subtitle={`${menu.department.name} · ${statusLabel}`}
      />
      <Link href="/menus" className="inline-flex text-sm font-medium text-zinc-900 underline underline-offset-2">
        Back to menus
      </Link>
      {loaded.unavailableReason ? (
        <div className="max-w-3xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {loaded.unavailableReason}
        </div>
      ) : null}

      <nav className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3" aria-label="Menu sections">
        <a
          href={`/menus/${menu.id}?tab=overview`}
          className={`rounded-md px-3 py-2 text-sm font-medium ${
            tab === "overview"
              ? "bg-zinc-900 text-white shadow-sm"
              : "border-2 border-zinc-300 bg-white font-semibold text-zinc-800 hover:bg-zinc-100"
          }`}
          aria-current={tab === "overview" ? "page" : undefined}
        >
          Overview
        </a>
        <a
          href={`/menus/${menu.id}?tab=menu&week=${selectedWeek}&day=${selectedDayIndex}`}
          className={`rounded-md px-3 py-2 text-sm font-medium ${
            tab === "menu"
              ? "bg-zinc-900 text-white shadow-sm"
              : "border-2 border-zinc-300 bg-white font-semibold text-zinc-800 hover:bg-zinc-100"
          }`}
          aria-current={tab === "menu" ? "page" : undefined}
        >
          Menu
        </a>
        <a
          href={`/menus/${menu.id}?tab=applicability`}
          className={`rounded-md px-3 py-2 text-sm font-medium ${
            tab === "applicability"
              ? "bg-zinc-900 text-white shadow-sm"
              : "border-2 border-zinc-300 bg-white font-semibold text-zinc-800 hover:bg-zinc-100"
          }`}
          aria-current={tab === "applicability" ? "page" : undefined}
        >
          Applicability
        </a>
      </nav>

      {tab === "overview" ? (
        <article className="space-y-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <MenuIdentityForm
            menuId={menu.id}
            name={menu.name}
            status={menu.status}
            departmentName={menu.department.name}
            updatedAt={menu.updatedAt}
            disabled={unavailable}
          />
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Cycle settings</h2>
            <div className="mt-3">
              <MenuPeriodSettingsForm
                menuId={menu.id}
                cycleLengthWeeks={settings.cycleLengthWeeks}
                weekStartsOn={settings.weekStartsOn}
                cycleAnchorDate={settings.cycleAnchorDate.toISOString().slice(0, 10)}
                periods={settings.periods}
                disabled={unavailable}
              />
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Applicability</h2>
            <p className="mt-2 text-sm text-zinc-600">
              {summary.locationCount} location{summary.locationCount === 1 ? "" : "s"}
              {summary.cycleLabels.length > 0 ? ` · ${summary.cycleLabels.join(", ")}` : " · No Operational Cycles yet"}
            </p>
            {attention.length > 0 ? (
              <p className="mt-2 text-sm text-amber-800">Needs Attention · {attention.length} item{attention.length === 1 ? "" : "s"}</p>
            ) : null}
          </div>
        </article>
      ) : null}

      {tab === "applicability" ? (
        <article className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <MenuApplicabilityForm
            menuId={menu.id}
            locations={departmentLocations?.locations ?? []}
            locationHierarchy={departmentLocations?.locationHierarchy ?? []}
            floorLabel={departmentLocations?.vocabulary.level1.singular ?? "Floor"}
            neighborhoodLabel={departmentLocations?.vocabulary.level2.singular ?? "Neighborhood"}
            selectedLocations={applicability.locations}
            eligibleCycles={eligibleCycles}
            selectedCycles={applicability.cycles}
            periods={settings.periods}
            attention={attention}
            disabled={unavailable}
          />
        </article>
      ) : null}

      {tab === "menu" ? (
        <>
          <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <fieldset disabled={unavailable} className="min-w-0 border-0 p-0">
              <legend className="sr-only">Menu cycle by week and day</legend>
              <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 pb-3">
                {Array.from({ length: settings.cycleLengthWeeks }, (_, idx) => idx + 1).map((week) => (
                  <a
                    key={week}
                    href={`/menus/${menu.id}?tab=menu&week=${week}&day=${selectedDayIndex}`}
                    className={`rounded-md px-3 py-2 text-sm font-medium ${
                      selectedWeek === week
                        ? "bg-zinc-900 text-white shadow-sm"
                        : "border-2 border-zinc-300 bg-white font-semibold text-zinc-800 hover:bg-zinc-100"
                    }`}
                  >
                    Week {week}
                  </a>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-b border-zinc-200 pb-3">
                {dayLabels.map((dayLabel, dayIndex) => (
                  <a
                    key={`${dayLabel}-${dayIndex}`}
                    href={`/menus/${menu.id}?tab=menu&week=${selectedWeek}&day=${dayIndex}`}
                    className={`rounded-md px-3 py-2 text-sm font-medium ${
                      selectedDayIndex === dayIndex
                        ? "bg-zinc-900 text-white shadow-sm"
                        : "border-2 border-zinc-300 bg-white font-semibold text-zinc-800 hover:bg-zinc-100"
                    }`}
                    aria-current={selectedDayIndex === dayIndex ? "page" : undefined}
                  >
                    {dayLabel}
                  </a>
                ))}
              </div>
              <div className="mt-4 space-y-5">
                <div className="rounded-lg border border-zinc-200 p-3">
                  <h3 className="text-base font-semibold text-zinc-900">{dayLabels[selectedDayIndex]}</h3>
                  <div className="mt-3">
                    <MenuDayBuilder
                      key={`${menu.id}-${selectedWeek}-${selectedDayIndex}`}
                      menuId={menu.id}
                      selectedWeek={selectedWeek}
                      selectedDayIndex={selectedDayIndex}
                      periods={settings.periods}
                      menuItems={loaded.menuItems}
                      disabled={unavailable}
                    />
                  </div>
                </div>
              </div>
            </fieldset>
          </article>

          <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">Live menu preview</h2>
            {unavailable ? (
              <p className="mt-2 text-sm text-zinc-600">Preview is unavailable until menu data can load.</p>
            ) : (
              <>
                <p className="mt-1 text-sm text-zinc-600">
                  Selected editor view: Week {selectedWeek} · {dayLabels[selectedDayIndex]}
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {settings.periods.map((period) => (
                    <div key={period.key} className="rounded border border-zinc-200 p-3">
                      <p className="text-sm font-semibold text-zinc-900">{period.label}</p>
                      <div className="mt-2 space-y-2 text-sm text-zinc-700">
                        {period.categories.map((category) => {
                          const values = selectedDayMenu[period.key]?.[category] ?? [];
                          return (
                            <div key={category}>
                              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{category}</p>
                              <p>{values.length > 0 ? values.join(", ") : "Not set"}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm text-zinc-600">
                  Cycle week {todayMenu.weekNumber} · {dayLabels[todayMenu.dayIndex]}
                </p>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {settings.periods.map((period) => (
                    <div key={period.key} className="rounded border border-zinc-200 p-3">
                      <p className="text-sm font-semibold text-zinc-900">{period.label}</p>
                      <div className="mt-2 space-y-2 text-sm text-zinc-700">
                        {period.categories.map((category) => {
                          const values = todayMenu.grouped[period.key]?.[category] ?? [];
                          return (
                            <div key={category}>
                              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{category}</p>
                              <p>{values.length > 0 ? values.join(", ") : "Not set"}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </article>
        </>
      ) : null}
    </section>
  );
}
