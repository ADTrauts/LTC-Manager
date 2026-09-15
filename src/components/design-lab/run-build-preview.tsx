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
type Accent = "teal" | "orange" | "purple";

type AccentTheme = {
  header: string;
  brandMark: string;
  brandIcon: string;
  muted: string;
  title: string;
  control: string;
  pill: string;
  banner: string;
  bannerMuted: string;
  sidebar: string;
  sidebarBorder: string;
  sidebarLabel: string;
  activeNav: string;
  crumb: string;
  crumbBar: string;
  iconWell: string;
  cardBorder: string;
};

const ACCENTS: Record<Accent, AccentTheme> = {
  teal: {
    header: "border-teal-800/20 bg-teal-950 text-teal-50",
    headerBorder: "border-teal-800/20",
    brandMark: "border-teal-700 bg-teal-900",
    brandIcon: "text-teal-100",
    muted: "text-teal-200/80",
    title: "text-white",
    control: "border-teal-700 bg-teal-900 text-teal-50",
    pill: "bg-teal-600 text-white shadow-sm",
    banner: "border-teal-800/30 bg-teal-900 text-teal-50",
    bannerBorder: "border-teal-800/30",
    bannerMuted: "text-teal-100",
    sidebar: "border-teal-200 bg-[#e8f4f2] text-zinc-800",
    sidebarBorder: "border-teal-200",
    sidebarLabel: "text-teal-800",
    activeNav: "bg-teal-800 text-white",
    crumb: "text-teal-800",
    crumbBar: "border-teal-100 bg-teal-50/70",
    iconWell: "border-teal-200 bg-teal-50 text-teal-800",
    cardBorder: "border-teal-100",
  },
  orange: {
    header: "border-orange-900/20 bg-[#3b1408] text-orange-50",
    headerBorder: "border-orange-900/20",
    brandMark: "border-orange-800 bg-orange-950",
    brandIcon: "text-orange-100",
    muted: "text-orange-200/80",
    title: "text-white",
    control: "border-orange-800 bg-orange-950 text-orange-50",
    pill: "bg-orange-500 text-white shadow-sm",
    banner: "border-orange-900/40 bg-[#4a1a0a] text-orange-50",
    bannerBorder: "border-orange-900/40",
    bannerMuted: "text-orange-100",
    sidebar: "border-orange-200 bg-[#fff4eb] text-zinc-800",
    sidebarBorder: "border-orange-200",
    sidebarLabel: "text-orange-800",
    activeNav: "bg-orange-600 text-white",
    crumb: "text-orange-800",
    crumbBar: "border-orange-100 bg-orange-50/80",
    iconWell: "border-orange-200 bg-orange-50 text-orange-800",
    cardBorder: "border-orange-100",
  },
  purple: {
    header: "border-violet-900/20 bg-[#1e1035] text-violet-50",
    headerBorder: "border-violet-900/20",
    brandMark: "border-violet-800 bg-violet-950",
    brandIcon: "text-violet-100",
    muted: "text-violet-200/80",
    title: "text-white",
    control: "border-violet-800 bg-violet-950 text-violet-50",
    pill: "bg-violet-600 text-white shadow-sm",
    banner: "border-violet-900/40 bg-[#2a1548] text-violet-50",
    bannerBorder: "border-violet-900/40",
    bannerMuted: "text-violet-100",
    sidebar: "border-violet-200 bg-[#f4eefc] text-zinc-800",
    sidebarBorder: "border-violet-200",
    sidebarLabel: "text-violet-800",
    activeNav: "bg-violet-700 text-white",
    crumb: "text-violet-800",
    crumbBar: "border-violet-100 bg-violet-50/80",
    iconWell: "border-violet-200 bg-violet-50 text-violet-800",
    cardBorder: "border-violet-100",
  },
};

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

function PreviewToolbar({
  mode,
  strength,
  accent,
}: {
  mode: Mode;
  strength: Strength;
  accent: Accent;
}) {
  const links = [
    { mode: "run" as const, strength: "current" as const, accent: "teal" as const, label: "Run · green" },
    { mode: "build" as const, strength: "current" as const, accent: "teal" as const, label: "Build · as today" },
    { mode: "build" as const, strength: "bold" as const, accent: "teal" as const, label: "Build · teal" },
    { mode: "build" as const, strength: "bold" as const, accent: "orange" as const, label: "Build · orange" },
    { mode: "build" as const, strength: "bold" as const, accent: "purple" as const, label: "Build · purple" },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3 py-2">
      <div className="flex min-w-0 items-center gap-2 text-xs text-zinc-500">
        <Link href="/design-lab" className="font-semibold text-zinc-700 hover:text-zinc-950">
          ← Design lab
        </Link>
        <span aria-hidden>·</span>
        <span className="truncate">Accent tests for Build — production unchanged</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {links.map((item) => {
          const active =
            mode === item.mode &&
            strength === item.strength &&
            (item.strength === "current" || accent === item.accent);
          return (
            <Link
              key={item.label}
              href={`/design-lab/run-build?mode=${item.mode}&strength=${item.strength}&accent=${item.accent}`}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
                active
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 bg-white text-zinc-700"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function ModePill({
  mode,
  strength,
  accent,
}: {
  mode: Mode;
  strength: Strength;
  accent: Accent;
}) {
  if (mode === "run") {
    return (
      <Link
        href="/design-lab/run-build?mode=build&strength=bold&accent=orange"
        className="inline-flex min-h-8 items-center rounded-md border border-emerald-700 bg-emerald-700 px-2.5 text-xs font-bold uppercase tracking-[0.08em] text-white"
        title="Switch to Build"
      >
        Run
      </Link>
    );
  }

  if (strength === "bold") {
    return (
      <Link
        href="/design-lab/run-build?mode=run&strength=current&accent=teal"
        className={`inline-flex min-h-8 items-center rounded-md px-2.5 text-xs font-bold uppercase tracking-[0.08em] ${ACCENTS[accent].pill}`}
        title="Switch to Run"
      >
        Build
      </Link>
    );
  }

  return (
    <Link
      href="/design-lab/run-build?mode=run&strength=current&accent=teal"
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
  accent,
}: {
  mode: Mode;
  strength: Strength;
  accent: Accent;
}) {
  const boldBuild = mode === "build" && strength === "bold";
  const theme = ACCENTS[accent];

  return (
    <div className="min-h-dvh bg-[#f7f7f8] text-zinc-900">
      <PreviewToolbar mode={mode} strength={strength} accent={accent} />

      <header className={`border-b ${boldBuild ? theme.header : "border-zinc-200 bg-white"}`}>
        <div className="flex flex-col gap-1 px-3 py-2 lg:px-4">
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-md border ${
                  boldBuild ? theme.brandMark : "border-zinc-200 bg-zinc-50"
                }`}
              >
                <Building2
                  className={`h-4 w-4 ${boldBuild ? theme.brandIcon : "text-zinc-600"}`}
                />
              </div>
              <div className="min-w-0">
                <p
                  className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${
                    boldBuild ? theme.muted : "text-zinc-500"
                  }`}
                >
                  LTC Manager
                </p>
                <p
                  className={`truncate text-sm font-semibold ${
                    boldBuild ? theme.title : "text-zinc-900"
                  }`}
                >
                  Terrace View Long Ter…
                </p>
                <p
                  className={`truncate text-[11px] ${boldBuild ? theme.muted : "text-zinc-500"}`}
                >
                  Signed in as Andrew Traut…
                </p>
              </div>
            </div>

            <div className="hidden items-center gap-1.5 sm:flex">
              <span
                className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${
                  boldBuild ? theme.muted : "text-zinc-400"
                }`}
              >
                Department
              </span>
              <button
                type="button"
                className={`inline-flex min-h-8 items-center gap-1 rounded-md border px-2 text-sm font-medium ${
                  boldBuild ? theme.control : "border-zinc-300 bg-white text-zinc-800"
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
                        ? "border-b-2 border-emerald-700 px-2.5 py-1.5 text-sm font-semibold text-emerald-900"
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
              <ModePill mode={mode} strength={strength} accent={accent} />
              <button
                type="button"
                className={`inline-flex min-h-8 items-center gap-1 rounded-md border px-2 text-sm ${
                  boldBuild ? theme.control : "border-zinc-300 bg-white text-zinc-700"
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
        <div className={`border-b px-3 py-2 text-sm lg:px-4 ${theme.banner}`}>
          <span className="font-semibold">Build mode</span>
          <span className="mx-2 opacity-60">—</span>
          <span className={theme.bannerMuted}>
            Configuring how the facility works. Switch to Run when you are ready to operate today.
          </span>
        </div>
      ) : null}

      <div className="flex min-h-[calc(100dvh-7rem)]">
        {mode === "run" ? (
          <aside className="w-[15.5rem] shrink-0 border-r border-emerald-100 bg-[#f3faf6]">
            <div className="border-b border-emerald-100 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800">
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
              boldBuild ? theme.sidebar : "border-blue-100 bg-[#eef4fb] text-zinc-800"
            }`}
          >
            <div
              className={`border-b px-3 py-2.5 ${
                boldBuild ? theme.sidebarBorder : "border-blue-100"
              }`}
            >
              <p
                className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
                  boldBuild ? theme.sidebarLabel : "text-blue-600"
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
                        ? `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-semibold ${
                            boldBuild ? theme.activeNav : "bg-blue-600 text-white"
                          }`
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

        <main className="min-w-0 flex-1 overflow-auto bg-white">
          <div
            className={`border-b px-5 py-2 ${
              boldBuild ? theme.crumbBar : mode === "run" ? "border-emerald-100 bg-emerald-50/50" : "border-zinc-100 bg-white"
            }`}
          >
            <p className="text-xs text-zinc-600">
              <span
                className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${
                  mode === "build"
                    ? boldBuild
                      ? theme.crumb
                      : "text-blue-600"
                    : "text-emerald-800"
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
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50">
                    <LayoutDashboard className="h-5 w-5 text-emerald-800" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                      Business Workspace
                    </h1>
                    <p className="mt-1 text-sm text-zinc-500">Terrace View · Dietary</p>
                  </div>
                </div>
                <p className="mt-5 text-lg font-medium text-zinc-900">Good morning Andrew</p>
                <p className="mt-1 text-sm text-zinc-600">Breakfast service — Preparation.</p>
                <button
                  type="button"
                  className="mt-4 inline-flex items-center gap-2 rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-900"
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
                        className="rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white"
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
                      boldBuild ? theme.iconWell : "border-zinc-200 bg-zinc-50 text-zinc-600"
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
                          boldBuild ? `${theme.cardBorder} shadow-sm` : "border-zinc-200"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex h-9 w-9 items-center justify-center rounded-md border ${
                              boldBuild
                                ? theme.iconWell
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
