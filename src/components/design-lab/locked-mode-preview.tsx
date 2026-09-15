"use client";

import Link from "next/link";
import {
  Building2,
  CalendarDays,
  ChevronDown,
  LayoutDashboard,
  Layers,
  MapPin,
  Package,
  Shield,
  Users,
  Wrench,
} from "lucide-react";

type Mode = "run" | "build";

const RUN_TABS = ["Dashboard", "Today's Work", "Locations", "Schedule", "Logs", "Assets"];
const BUILD_NAV = [
  { label: "Build Home", icon: Layers, active: true },
  { label: "Facility Builder", icon: MapPin },
  { label: "Department Builder", icon: Shield },
  { label: "Employee Builder", icon: Users },
  { label: "Asset Builder", icon: Package },
];

/**
 * Locked visual contract preview — mirrors production Run emerald / Build orange accents.
 */
export function LockedModePreview({ mode }: { mode: Mode }) {
  const isBuild = mode === "build";

  return (
    <div
      data-shell-root
      data-product-mode={isBuild ? "BUILD" : "RUN"}
      className="min-h-dvh bg-zinc-50 text-zinc-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3 py-2">
        <p className="text-xs text-zinc-500">
          Locked accents · Run = emerald · Build = orange · production shell contract
        </p>
        <div className="flex gap-2">
          <Link
            href="/design-lab/locked?mode=run"
            className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
              !isBuild ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white"
            }`}
          >
            Run · locked
          </Link>
          <Link
            href="/design-lab/locked?mode=build"
            className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
              isBuild ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white"
            }`}
          >
            Build · locked
          </Link>
        </div>
      </div>

      <header
        data-shell-region="header"
        className="border-b border-zinc-200 bg-white"
      >
        <div className="flex items-center gap-3 px-3 py-2 lg:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50">
              <Building2 className="h-4 w-4 text-zinc-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                LTC Manager
              </p>
              <p className="truncate text-sm font-semibold text-zinc-900">Terrace View Long Ter…</p>
            </div>
          </div>

          {!isBuild ? (
            <nav className="hidden min-w-0 flex-1 items-end gap-1 md:flex">
              {RUN_TABS.map((tab, i) => (
                <span
                  key={tab}
                  className={
                    i === 0
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
            <span
              className={
                isBuild
                  ? "inline-flex min-h-8 items-center rounded-md bg-orange-500 px-2.5 text-xs font-bold uppercase tracking-[0.08em] text-white shadow-sm"
                  : "inline-flex min-h-8 items-center rounded-md bg-emerald-700 px-2.5 text-xs font-bold uppercase tracking-[0.08em] text-white shadow-sm"
              }
            >
              {isBuild ? "Build" : "Run"}
            </span>
            <button
              type="button"
              className="inline-flex min-h-8 items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-700"
            >
              Andrew Tra…
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </button>
          </div>
        </div>
      </header>

      {isBuild ? (
        <div
          data-shell-region="mode-banner"
          className="border-b border-orange-900/30 bg-[#3b1408] px-3 py-2 text-sm text-orange-50 lg:px-4"
        >
          <span className="font-semibold">Build mode</span>
          <span className="mx-2 text-orange-300/80">—</span>
          <span className="text-orange-100">
            Configuring how the facility works. Switch to Run when you are ready to operate today.
          </span>
        </div>
      ) : null}

      <div className="flex min-h-[calc(100dvh-8rem)]">
        <aside
          data-shell-region="sidebar"
          className="w-[15.5rem] shrink-0 border-r border-zinc-200 bg-white"
        >
          {isBuild ? (
            <>
              <div className="border-b border-orange-200 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-orange-800">
                  Build
                </p>
              </div>
              <nav className="space-y-0.5 p-2">
                {BUILD_NAV.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className={
                        item.active
                          ? "flex items-center gap-2.5 rounded-md bg-orange-500 px-2.5 py-2 text-sm font-semibold text-white"
                          : "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-zinc-700"
                      }
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {item.label}
                    </div>
                  );
                })}
              </nav>
            </>
          ) : (
            <>
              <div className="border-b border-emerald-100 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800">
                  Locations
                </p>
              </div>
              <div className="space-y-0.5 p-2">
                {["Retail", "Main Kitchen", "Servery A"].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-zinc-700"
                  >
                    <MapPin className="h-3.5 w-3.5 text-zinc-400" />
                    <span className="flex-1">{item}</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Ready
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>

        <main className="min-w-0 flex-1 bg-white">
          <div
            data-shell-region="mode-indicator"
            className="border-b border-zinc-200 px-5 py-2"
          >
            <p className="flex items-center text-xs text-zinc-600">
              <span
                className={
                  isBuild
                    ? "inline-flex items-center rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white"
                    : "inline-flex items-center rounded bg-emerald-700 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white"
                }
              >
                {isBuild ? "Build" : "Run"}
              </span>
              <span className="mx-1.5 text-zinc-300">/</span>
              <span className="font-medium text-zinc-800">
                {isBuild ? "Build Home" : "Dashboard"}
              </span>
            </p>
          </div>

          <div className="px-5 py-6">
            {isBuild ? (
              <>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-orange-200 bg-orange-50 text-orange-800">
                    <Wrench className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Build</h1>
                    <p className="mt-1 text-sm text-zinc-600">
                      Configure operations — then switch to Run to operate today.
                    </p>
                  </div>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {BUILD_NAV.slice(1).map((card) => {
                    const Icon = card.icon;
                    return (
                      <article
                        key={card.label}
                        className="rounded-xl border border-orange-100 bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-orange-200 bg-orange-50 text-orange-800">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <h2 className="text-sm font-semibold">{card.label}</h2>
                            <p className="mt-1 text-sm text-zinc-600">Configuration tools for this area.</p>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800">
                    <LayoutDashboard className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Business Workspace</h1>
                    <p className="mt-1 text-sm text-zinc-500">Terrace View · Dietary</p>
                  </div>
                </div>
                <p className="mt-5 text-lg font-medium">Good morning Andrew</p>
                <p className="mt-1 text-sm text-zinc-600">Breakfast service — Preparation.</p>
                <button
                  type="button"
                  className="mt-4 inline-flex items-center gap-2 rounded-md border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-900"
                >
                  <CalendarDays className="h-4 w-4" />
                  Customize Workspace
                </button>
                <div className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <p className="text-sm font-medium">Current dietary operations are on track.</p>
                  <button
                    type="button"
                    className="mt-3 rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white"
                  >
                    Open Dashboard
                  </button>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
