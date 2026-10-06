"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";

import { installPlantStarterAction } from "@/app/(protected)/admin/departments/[departmentId]/plant-starter-actions";
import type {
  PlantStarterInstallResult,
  PlantStarterLoadItem,
} from "@/lib/department-products/plant-starter-catalog";
import {
  PLANT_STARTER_INTRO,
  PLANT_STARTER_PACKAGE_NAME,
} from "@/lib/department-products/plant-starter-catalog";

type Props = {
  facilityId: string;
  departmentId: string;
  items: PlantStarterLoadItem[];
  defaultOpen?: boolean;
};

export function PlantStarterPanel({
  facilityId,
  departmentId,
  items,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<PlantStarterInstallResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const initial = useMemo(() => {
    const next: Record<string, boolean> = {};
    for (const item of items) {
      next[item.id] = item.alreadyAdded ? false : item.defaultSelected;
    }
    return next;
  }, [items]);

  useEffect(() => {
    setSelected(initial);
  }, [initial]);

  function toggle(id: string, alreadyAdded: boolean) {
    if (alreadyAdded) return;
    setSelected((current) => ({ ...current, [id]: !current[id] }));
  }

  function onInstall() {
    const selectedIds = items
      .filter((item) => !item.alreadyAdded && selected[item.id])
      .map((item) => item.id);
    setError(null);
    startTransition(async () => {
      try {
        const next = await installPlantStarterAction({
          facilityId,
          departmentId,
          selectedIds,
        });
        setResult(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to add starter configuration.");
      }
    });
  }

  const work = items.filter((item) => item.kind === "work");
  const records = items.filter((item) => item.kind === "record");
  const selectable = items.filter((item) => !item.alreadyAdded && selected[item.id]).length;

  return (
    <section className="space-y-3 rounded-lg border border-zinc-200 bg-white px-4 py-4" data-testid="plant-starter-panel">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">{PLANT_STARTER_PACKAGE_NAME}</h2>
          <p className="mt-1 text-xs text-zinc-600">{PLANT_STARTER_INTRO}</p>
        </div>
        <button
          type="button"
          className="text-xs font-medium text-zinc-700 underline underline-offset-2"
          data-testid="add-starter-configuration"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide starter configuration" : "Add starter configuration"}
        </button>
      </div>

      {open ? (
        <div className="space-y-4" data-testid="plant-starter-review">
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Recurring Work
            </legend>
            {work.map((item) => (
              <label key={item.id} className="flex items-start gap-2 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  checked={item.alreadyAdded || Boolean(selected[item.id])}
                  disabled={item.alreadyAdded || pending}
                  onChange={() => toggle(item.id, item.alreadyAdded)}
                  data-testid={`starter-work-${item.id}`}
                />
                <span>
                  <span className="font-medium">{item.title}</span>
                  {item.alreadyAdded ? (
                    <span className="ml-2 text-xs text-zinc-500">Already added</span>
                  ) : null}
                  <span className="block text-xs text-zinc-600">{item.description}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Record Templates
            </legend>
            {records.map((item) => (
              <label key={item.id} className="flex items-start gap-2 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  checked={item.alreadyAdded || Boolean(selected[item.id])}
                  disabled={item.alreadyAdded || pending}
                  onChange={() => toggle(item.id, item.alreadyAdded)}
                  data-testid={`starter-record-${item.id}`}
                />
                <span>
                  <span className="font-medium">{item.title}</span>
                  {item.alreadyAdded ? (
                    <span className="ml-2 text-xs text-zinc-500">Already added</span>
                  ) : null}
                  <span className="block text-xs text-zinc-600">{item.description}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <button
            type="button"
            disabled={pending || selectable === 0}
            onClick={onInstall}
            className="inline-flex min-h-10 items-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-700 disabled:bg-zinc-400"
            data-testid="plant-starter-install"
          >
            {pending ? "Adding…" : "Add selected configuration"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-800" data-testid="plant-starter-result">
          <p className="font-medium">Starter configuration added</p>
          <p className="mt-1">
            {result.workAdded} recurring Work preset{result.workAdded === 1 ? "" : "s"} added
          </p>
          <p>
            {result.recordAdded} Record template{result.recordAdded === 1 ? "" : "s"} added
          </p>
          {result.alreadyExisted > 0 ? (
            <p>
              {result.alreadyExisted} item{result.alreadyExisted === 1 ? "" : "s"} already existed
            </p>
          ) : null}
          <p className="mt-2 text-xs text-zinc-600">
            Drafts are Facility-owned and not published. Review location, cadence, and assignment
            before publishing.
          </p>
          <p className="mt-2 flex flex-wrap gap-3">
            <Link href={result.workHref} className="font-medium underline underline-offset-2">
              Open Work
            </Link>
            <Link href={result.recordsHref} className="font-medium underline underline-offset-2">
              Open Records
            </Link>
          </p>
        </div>
      ) : null}
    </section>
  );
}
