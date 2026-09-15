"use client";

import Link from "next/link";
import {
  Building2,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Layers,
  MapPin,
  Package,
  Shield,
  Users,
  UtensilsCrossed,
  Wrench,
} from "lucide-react";

type Mode = "run" | "build";
type Strength = "current" | "bold";

const RUN_TABS = [
  "Dashboard",
  "Today's Work",
  "Locations",
  "Schedule",
  "Logs",
  "Assets",
  "Legacy Lo…",
];

const BUILD_NAV = [
  { label: "Build Home", icon: Layers, active: true },
  { label: "Facility Builder", icon: MapPin },
  { label: "Department Builder", icon: Shield },
  { label: "Employee Builder", icon: Users },
  { label: "Asset Builder", icon: Package },
  { label: "Menu Building", icon: UtensilsCrossed },
  { label: "Logs", icon: Layers },
  { label: "Procedures & Resources", icon: FileText },
];

const BUILD_CARDS = [
  {
    title: "Facility Builder",
    detail: "Physical structure — floors, rooms, and locations.",
    icon: MapPin,
  },
  {
    title: "Department Builder",
    detail: "Operational cycles, work plans, and routing.",
    icon: Shield,
  },
  {
    title: "Employee Builder",
    detail: "Workforce configuration — records and roles.",
    icon: Users,
  },
  {
    title: "Asset Builder",
    detail: "Register equipment. Condition and repairs live under RUN Assets.",
    icon: Package,
  },
  {
    title: "Menu Building",
    detail: "Dietary menu cycles and items.",
    icon: UtensilsCrossed,
  },
  {
    title: "Logs",
    detail: "Browse catalogs and facility attachments.",
    icon: ClipboardList,
  },
];

const LOCATIONS = [
  {
    group: "GROUND",
    items: ["Retail", "Main Kitchen"],
  },
  {
    group: "GC · KENSINGTON",
    items: ["Naval Park"],
  },
  {
    group: "FLOOR 1",
    items: ["Servery A", "Servery B"],
  },
];

function PreviewToolbar({ mode, strength }: { mode: Mode; strength: Strength }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3 py-2">
      <div className="flex min-w-0 items-center gap-2 text-xs text-zinc-500">
        <Link href="/design-lab" className="font-semibold text-zinc-700 hover:text-zinc-950">
          ← Design lab
        </Link>
        <span aria-hidden>·</span>
        <span className="truncate">Faithful to your live Run/Build shell — production unchanged</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["run", "current", "Run · as today"],
            ["build", "current", "Build · as today"],
            ["build", "bold", "Build · bolder"],
          ] as const
        ).map(([m, s, label]) => {
          const active = mode === m && strength === s;
          return (
            <Link
              key={label}
              href={`/design-lab/run-build?mode=${m}&strength=${s}`}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
                active
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 bg-white text-zinc-700"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function ModePill({ mode, strength }: { mode: Mode; strength: Strength }) {
  if (mode === "run") {
    return (
      <Link
        href="/design-lab/run-build?mode=build&strength=current"
        className="inline-flex min-h-8 items-center rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-bold uppercase tracking-[0.08em] text-zinc-700"
        title="Switch to Build"
      >
        Run
      </Link>
    );
  }

  if (strength === "bold") {
    return (
      <Link
        href="/design-lab/run-build?mode=run&strength=current"
        className="inline-flex min-h-8 items-center rounded-md bg-teal-800 px-2.5 text-xs font-bold uppercase tracking-[0.08em] text-white shadow-sm"
        title="Switch to Run"
      >
        Build
      </Link>
    );
  }

  return (
    <Link
      href="/design-lab/run-build?mode=run&strength=current"
      className="inline-flex min-h-8 items-center rounded-md border border-blue-500 bg-white px-2.5 text-xs font-bold uppercase tracking-[0.08em] text-blue-600"
      title="Switch to Run"
    >
      Build
    </Link>
  );
}

export function RunBuildPreview({
  mode,
  strength,
}: {
  mode: Mode;
  strength: Strength;
}) {
  const boldBuild = mode === "build" && strength === "bold";

  return (
    <div className="min-h-dvh bg-[#f7f7f8] text-zinc-900">
      <PreviewToolbar mode={mode} strength={strength} />

      {/* Top header — matches live app */}
      <header
        className={`border-b ${
          boldBuild ? "border-teal-800/20 bg-teal-950 text-teal-50" : "border-zinc-200 bg-white"
        }`}
      >
        <div className="flex flex-col gap-1 px-3 py-2 lg:px-4">
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-md border ${
                  boldBuild ? "border-teal-700 bg-teal-900" : "border-zinc-200 bg-zinc-50"
                }`}
              >
                <Building2 className={`h-4 w-4 ${boldBuild ? "text-teal-100" : "text-zinc-600"}`} />
              </div>
              <div className="min-w-0">
                <p
                  className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${
                    boldBuild ? "text-teal-200/80" : "text-zinc-500"
                  }`}
                >
                  LTC Manager
                </p>
                <p className={`truncate text-sm font-semibold ${boldBuild ? "text-white" : "text-zinc-900"}`}>
                  Terrace View Long Ter…
                </p>
                <p className={`truncate text-[11px] ${boldBuild ? "text-teal-200/70" : "text-zinc-500"}`}>
                  Signed in as Andrew Traut…
                </p>
              </div>
            </div>

            <div className="hidden items-center gap-1.5 sm:flex">
              <span
                className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${
                  boldBuild ? "text-teal-200/70" : "text-zinc-400"
                }`}
              >
                Department
              </span>
              <button
                type="button"
                className={`inline-flex min-h-8 items-center gap-1 rounded-md border px-2 text-sm font-medium ${
                  boldBuild
                    ? "border-teal-700 bg-teal-900 text-teal-50"
                    : "border-zinc-300 bg-white text-zinc-800"
                }`}
              >
                Dietary
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>
            </div>

            {mode === "run" ? (
              <nav className="hidden min-w-0 flex-1 items-end gap-1 overflow-x-auto md:flex">
                {RUN_TABS.map((tab, index) => (
                  <span
                    key={tab}
                    className={
                      index === 0
                        ? "border-b-2 border-zinc-900 px-2.5 py-1.5 text-sm font-semibold text-zinc-900"
                        : "px-2.5 py-1.5 text-sm font-medium text-zinc-600"
                    }
                  >
                    {tab}
                  </span>
                ))}
              </nav>
            ) : (
              <div className="min-w-0 flex-1" />
            )}

            <div className="ml-auto flex items-center gap-2">
              <ModePill mode={mode} strength={strength} />
              <button
                type="button"
                className={`inline-flex min-h-8 items-center gap-1 rounded-md border px-2 text-sm ${
                  boldBuild
                    ? "border-teal-700 bg-teal-900 text-teal-50"
                    : "border-zinc-300 bg-white text-zinc-700"
                }`}
              >
                Andrew Tra…
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {boldBuild ? (
        <div className="border-b border-teal-800/30 bg-teal-900 px-3 py-2 text-sm text-teal-50 lg:px-4">
          <span className="font-semibold">Build mode</span>
          <span className="mx-2 text-teal-300">—</span>
          <span className="text-teal-100">
            Configuring how the facility works. Switch to Run when you are ready to operate today.
          </span>
        </div>
      ) : null}

      <div className="flex min-h-[calc(100dvh-7rem)]">
        {/* Left rail */}
        {mode === "run" ? (
          <aside className="w-[15.5rem] shrink-0 border-r border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                Locations
              </p>
            </div>
            <div className="space-y-3 p-2">
              {LOCATIONS.map((section) => (
                <div key={section.group}>
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400">
                    {section.group}
                  </p>
                  <div className="space-y-0.5">
                    {section.items.map((item) => (
                      <div
                        key={item}
                        className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-zinc-700"
                      >
                        <MapPin className="h-3.5 w-3.5 text-zinc-400" />
                        <span className="min-w-0 flex-1 truncate">{item}</span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Ready
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        ) : (
          <aside
            className={`w-[15.5rem] shrink-0 border-r ${
              boldBuild
                ? "border-teal-200 bg-[#e8f4f2] text-zinc-800"
                : "border-blue-100 bg-[#eef4fb] text-zinc-800"
            }`}
          >
            <div className={`border-b px-3 py-2.5 ${boldBuild ? "border-teal-200" : "border-blue-100"}`}>
              <p
                className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
                  boldBuild ? "text-teal-800" : "text-blue-600"
                }`}
              >
                Build
              </p>
            </div>
            <nav className="space-y-0.5 p-2">
              {BUILD_NAV.map((item) => {
                const Icon = item.icon;
                const active = Boolean(item.active);
                return (
                  <div
                    key={item.label}
                    className={
                      active
                        ? boldBuild
                          ? "flex items-center gap-2.5 rounded-md bg-teal-800 px-2.5 py-2 text-sm font-semibold text-white"
                          : "flex items-center gap-2.5 rounded-md bg-blue-600 px-2.5 py-2 text-sm font-semibold text-white"
                        : "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-zinc-700"
                    }
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" />
                    <span className="truncate">{item.label}</span>
                  </div>
                );
              })}
            </nav>
          </aside>
        )}

        {/* Main */}
        <main className="min-w-0 flex-1 overflow-auto bg-white">
          <div
            className={`border-b px-5 py-2 ${
              boldBuild ? "border-teal-100 bg-teal-50/70" : "border-zinc-100 bg-white"
            }`}
          >
            <p className="text-xs text-zinc-600">
              <span
                className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${
                  mode === "build"
                    ? boldBuild
                      ? "text-teal-800"
                      : "text-blue-600"
                    : "text-zinc-400"
                }`}
              >
                {mode === "run" ? "Run" : "Build"}
              </span>
              <span className="mx-1.5 text-zinc-300">/</span>
              <span className="font-medium text-zinc-800">
                {mode === "run" ? "Dashboard" : "Build Home"}
              </span>
            </p>
          </div>

          <div className="px-5 py-6">
            {mode === "run" ? (
              <>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50">
                    <LayoutDashboard className="h-5 w-5 text-zinc-600" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                      Business Workspace
                    </h1>
                    <p className="mt-1 text-sm text-zinc-500">
                      Terrace View · Dietary
                    </p>
                  </div>
                </div>
                <p className="mt-5 text-lg font-medium text-zinc-900">Good morning Andrew</p>
                <p className="mt-1 text-sm text-zinc-600">Breakfast service — Preparation.</p>
                <button
                  type="button"
                  className="mt-4 inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800"
                >
                  <CalendarDays className="h-4 w-4" />
                  Customize Workspace
                </button>
                <section className="mt-8">
                  <h2 className="text-sm font-semibold text-zinc-900">Manager Focus</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    What you should personally work on next — at most three actions.
                  </p>
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                    <p className="text-sm font-medium text-zinc-900">
                      Current dietary operations are on track.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white"
                      >
                        Open Dashboard
                      </button>
                      <button
                        type="button"
                        className="rounded-md px-3 py-2 text-sm font-medium text-zinc-700"
                      >
                        Review Today&apos;s Work
                      </button>
                    </div>
                  </div>
                </section>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg border ${
                      boldBuild
                        ? "border-teal-200 bg-teal-50 text-teal-800"
                        : "border-zinc-200 bg-zinc-50 text-zinc-600"
                    }`}
                  >
                    <Wrench className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Build</h1>
                    <p className="mt-1 max-w-2xl text-sm text-zinc-600">
                      Configure operations — set up how your operation works, then switch to Run to
                      operate it.
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {BUILD_CARDS.map((card) => {
                    const Icon = card.icon;
                    return (
                      <article
                        key={card.title}
                        className={`rounded-xl border bg-white p-4 ${
                          boldBuild ? "border-teal-100 shadow-sm" : "border-zinc-200"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex h-9 w-9 items-center justify-center rounded-md border ${
                              boldBuild
                                ? "border-teal-200 bg-teal-50 text-teal-800"
                                : "border-zinc-200 bg-zinc-50 text-zinc-600"
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <h2 className="text-sm font-semibold text-zinc-900">{card.title}</h2>
                            <p className="mt-1 text-sm text-zinc-600">{card.detail}</p>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
