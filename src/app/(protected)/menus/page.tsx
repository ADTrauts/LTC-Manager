import { unstable_noStore as noStore } from "next/cache";

import { MenuDayBuilder } from "@/components/menus/menu-day-builder";
import { MenuPeriodSettingsForm } from "@/components/menus/menu-period-settings-form";
import { requireFacilitySession } from "@/lib/facility-context";
import { dayLabelsForWeekStart, ensureMenuSettingsDefaults, menuForCycleSlot, menuForDate } from "@/lib/menu-cycle";
import { loadFacilityMenuData } from "@/lib/menu-db";
import { prisma } from "@/lib/prisma";

type MenusPageProps = {
  searchParams?: Promise<{ week?: string; tab?: string; day?: string }>;
};

export default async function MenusPage({ searchParams }: MenusPageProps) {
  noStore();
  const session = await requireFacilitySession();
  const params = searchParams ? await searchParams : undefined;
  const tab = params?.tab === "settings" ? "settings" : "builder";

  const menuData = await loadFacilityMenuData(prisma, session.facilityId, {
    menuItemsOrderBy: [{ weekNumber: "asc" }, { dayIndex: "asc" }, { mealPeriodKey: "asc" }, { displayOrder: "asc" }],
  });
  const { settingsRaw, menuItems, unavailableReason: menuUnavailableReason } = menuData;
  const settings = ensureMenuSettingsDefaults(settingsRaw);

  const requestedWeek = Number.parseInt(params?.week ?? "", 10);
  const selectedWeek =
    Number.isFinite(requestedWeek) && requestedWeek >= 1 && requestedWeek <= settings.cycleLengthWeeks ? requestedWeek : 1;
  const dayLabels = dayLabelsForWeekStart(settings.weekStartsOn);
  const requestedDay = Number.parseInt(params?.day ?? "", 10);
  const selectedDayIndex = Number.isFinite(requestedDay) && requestedDay >= 0 && requestedDay <= 6 ? requestedDay : 0;

  const todayMenu = menuForDate({
    date: new Date(),
    settings,
    periods: settings.periods,
    menuItems,
  });
  const selectedDayMenu = menuForCycleSlot({
    weekNumber: selectedWeek,
    dayIndex: selectedDayIndex,
    periods: settings.periods,
    menuItems,
  });

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Menu Building</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600">
          Build a repeating 3- or 4-week menu cycle and keep daily meal items aligned with servery operations and temperature logs.
        </p>
        {menuUnavailableReason ? (
          <div className="mt-3 max-w-3xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {menuUnavailableReason}
          </div>
        ) : null}
      </header>

      <nav className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3" aria-label="Menu sections">
        <a
          href={`/menus?tab=builder&week=${selectedWeek}&day=${selectedDayIndex}`}
          className={`rounded-md px-3 py-2 text-sm font-medium ${
            tab === "builder"
              ? "bg-zinc-900 text-white shadow-sm"
              : "border-2 border-zinc-300 bg-white font-semibold text-zinc-800 hover:bg-zinc-100"
          }`}
          aria-current={tab === "builder" ? "page" : undefined}
        >
          Builder
        </a>
        <a
          href="/menus?tab=settings"
          className={`rounded-md px-3 py-2 text-sm font-medium ${
            tab === "settings"
              ? "bg-zinc-900 text-white shadow-sm"
              : "border-2 border-zinc-300 bg-white font-semibold text-zinc-800 hover:bg-zinc-100"
          }`}
          aria-current={tab === "settings" ? "page" : undefined}
        >
          Settings
        </a>
      </nav>

      {tab === "settings" ? (
        <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Menu cycle settings</h2>
          <div className="mt-3">
            <MenuPeriodSettingsForm
              cycleLengthWeeks={settings.cycleLengthWeeks}
              weekStartsOn={settings.weekStartsOn}
              cycleAnchorDate={settings.cycleAnchorDate.toISOString().slice(0, 10)}
              periods={settings.periods}
              disabled={Boolean(menuUnavailableReason)}
            />
          </div>
        </article>
      ) : null}

      {tab === "builder" ? (
        <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <fieldset disabled={Boolean(menuUnavailableReason)} className="min-w-0 border-0 p-0">
            <legend className="sr-only">Menu cycle by week and day</legend>
            <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 pb-3">
              {Array.from({ length: settings.cycleLengthWeeks }, (_, idx) => idx + 1).map((week) => (
                <a
                  key={week}
                  href={`/menus?tab=builder&week=${week}&day=${selectedDayIndex}`}
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
                  href={`/menus?tab=builder&week=${selectedWeek}&day=${dayIndex}`}
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
                    key={`${selectedWeek}-${selectedDayIndex}`}
                    selectedWeek={selectedWeek}
                    selectedDayIndex={selectedDayIndex}
                    periods={settings.periods}
                    menuItems={menuItems}
                    disabled={Boolean(menuUnavailableReason)}
                  />
                </div>
              </div>
            </div>
          </fieldset>
        </article>
      ) : null}

      {tab === "builder" ? (
        <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Live menu preview</h2>
          {menuUnavailableReason ? (
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
      ) : null}
    </section>
  );
}

