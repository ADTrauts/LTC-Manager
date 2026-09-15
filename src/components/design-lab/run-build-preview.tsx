"use client";

import Link from "next/link";
import {
  Building2,
  CalendarClock,
  ClipboardList,
  LayoutDashboard,
  MapPin,
  Package,
  Shield,
  Users,
  UtensilsCrossed,
  Wrench,
} from "lucide-react";

type Mode = "run" | "build";
type Strength = "current" | "clear";

const RUN_NAV = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Today's Work", icon: CalendarClock },
  { label: "Locations", icon: MapPin },
  { label: "Log Book", icon: ClipboardList },
  { label: "Assets", icon: Package },
];

const BUILD_NAV = [
  { label: "Build Home", icon: Wrench },
  { label: "Departments", icon: Building2 },
  { label: "Employees", icon: Users },
  { label: "Menus", icon: UtensilsCrossed },
  { label: "Templates", icon: ClipboardList },
];

const BUILD_CARDS = [
  { title: "Department Builder", detail: "Modes, locations, and how work is organized." },
  { title: "Employee Builder", detail: "Roster, roles, and who can run each area." },
  { title: "Menu Building", detail: "Cycles, recipes, and service menus." },
  { title: "Operational Templates", detail: "Reusable work patterns for shifts." },
];

function ModeSwitch({ mode, strength }: { mode: Mode; strength: Strength }) {
  const track =
    strength === "clear" && mode === "build"
      ? "border-teal-700/30 bg-teal-50"
      : "border-zinc-200 bg-zinc-50";

  return (
    <div
      className={`flex shrink-0 items-center rounded-md border p-0.5 ${track}`}
      role="group"
      aria-label="Product mode"
    >
      {(["run", "build"] as const).map((item) => {
        const active = item === mode;
        const activeClass =
          strength === "clear" && mode === "build" && item === "build"
            ? "bg-teal-800 text-white shadow-sm"
            : active
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-500";
        return (
          <Link
            key={item}
            href={`/design-lab/run-build?mode=${item}&strength=${strength}`}
            aria-current={active ? "true" : undefined}
            className={`inline-flex min-h-8 items-center rounded-[5px] px-3 text-sm ${
              active ? `font-semibold ${activeClass}` : "font-medium hover:text-zinc-800"
            }`}
          >
            {item === "run" ? "Run" : "Build"}
          </Link>
        );
      })}
    </div>
  );
}

export function RunBuildPreview({
  mode,
  strength,
}: {
  mode: Mode;
  strength: Strength;
}) {
  const nav = mode === "run" ? RUN_NAV : BUILD_NAV;
  const area = mode === "run" ? "Dashboard" : "Build Home";
  const showClearBanner = strength === "clear" && mode === "build";

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs text-zinc-500">
          <Link href="/design-lab" className="font-semibold text-zinc-600 hover:text-zinc-900">
            ← Design lab
          </Link>
          <span aria-hidden>·</span>
          <span>Run vs Build preview — production unchanged</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/design-lab/run-build?mode=${mode}&strength=current`}
            className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
              strength === "current"
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300 bg-white text-zinc-700"
            }`}
          >
            Current signal (subtle)
          </Link>
          <Link
            href={`/design-lab/run-build?mode=${mode}&strength=clear`}
            className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
              strength === "clear"
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300 bg-white text-zinc-700"
            }`}
          >
            Clearer Build signal
          </Link>
        </div>
      </div>

      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-2 lg:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50">
              <Building2 className="h-4 w-4 text-zinc-600" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                LTC Manager
              </p>
              <p className="truncate text-sm font-semibold text-zinc-900">Terrace View Care Center</p>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-3">
            <ModeSwitch mode={mode} strength={strength} />
            <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
              {nav.map((item, index) => {
                const Icon = item.icon;
                const active = index === 0;
                return (
                  <span
                    key={item.label}
                    className={
                      active
                        ? "inline-flex items-center gap-1.5 border-b-2 border-zinc-900 px-2.5 py-2 text-sm font-semibold text-zinc-900"
                        : "inline-flex items-center gap-1.5 px-2.5 py-2 text-sm font-medium text-zinc-600"
                    }
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {item.label}
                  </span>
                );
              })}
            </nav>
          </div>

          <span className="hidden items-center gap-1.5 text-sm text-zinc-600 sm:inline-flex">
            <Shield className="h-3.5 w-3.5" aria-hidden />
            Admin
          </span>
        </div>
      </header>

      <div
        className={`border-b px-4 py-1.5 sm:px-4 lg:px-6 ${
          showClearBanner ? "border-teal-800/20 bg-teal-900 text-teal-50" : "border-zinc-200 bg-white"
        }`}
      >
        <p className="text-xs leading-none">
          <span
            className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${
              showClearBanner ? "text-teal-100" : "text-zinc-500"
            }`}
            title={mode === "run" ? "Operate today" : "Configure operations"}
          >
            {mode === "run" ? "Run" : "Build"}
          </span>
          <span className={`mx-1.5 ${showClearBanner ? "text-teal-300" : "text-zinc-300"}`} aria-hidden>
            /
          </span>
          <span className={`font-medium ${showClearBanner ? "text-white" : "text-zinc-800"}`}>
            {area}
          </span>
          {showClearBanner ? (
            <span className="ml-3 text-[11px] text-teal-100/90">
              Configuring operations — changes affect how the facility runs
            </span>
          ) : null}
        </p>
      </div>

      <main className="mx-auto max-w-3xl px-4 py-8 lg:px-6">
        {mode === "run" ? (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
              Operate today
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Dashboard</h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-600">
              Day-of operations: what needs attention, location readiness, and work already in motion.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {["Open issues · 7", "Inspections due · 4", "Coverage gaps · 1"].map((card) => (
                <article
                  key={card}
                  className="rounded-xl border border-zinc-200 bg-white p-4 text-sm font-medium text-zinc-800 shadow-sm"
                >
                  {card}
                </article>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
              Configure operations
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Build</h1>
            <p className="mt-2 max-w-xl text-sm text-zinc-600">
              Set up how your operation works — departments, people, menus, and templates. This is not
              the day-of run surface.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {BUILD_CARDS.map((card) => (
                <article
                  key={card.title}
                  className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
                >
                  <h2 className="text-sm font-semibold text-zinc-900">{card.title}</h2>
                  <p className="mt-1 text-sm text-zinc-600">{card.detail}</p>
                </article>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
