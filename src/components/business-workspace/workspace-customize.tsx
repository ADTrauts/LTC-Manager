"use client";

import { useEffect, useState, useTransition } from "react";

import {
  setWorkspacePreferredLandingAction,
  setWorkspaceSectionOrderAction,
  toggleWorkspaceSectionCollapsedAction,
  updateWorkspaceHiddenSectionsAction,
} from "@/app/(protected)/workspace/actions";
import { SectionHeader } from "@/components/design-system";
import type { WorkspaceSectionId } from "@/lib/business-workspace";
import { WORKSPACE_SECTION_DEFS } from "@/lib/business-workspace";

export function WorkspaceCollapsibleSection({
  sectionId,
  title,
  description,
  collapsed,
  children,
}: {
  sectionId: WorkspaceSectionId;
  title: string;
  description: string;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <section
      id={`workspace-section-${sectionId}`}
      className="space-y-4"
      data-testid={`workspace-section-${sectionId}`}
      data-collapsed={collapsed ? "true" : "false"}
    >
      <SectionHeader
        title={title}
        description={description}
        prominent
        actions={
          <form
            action={(formData) => {
              startTransition(() => {
                void toggleWorkspaceSectionCollapsedAction(formData);
              });
            }}
          >
            <input type="hidden" name="sectionId" value={sectionId} />
            <input type="hidden" name="collapsed" value={collapsed ? "false" : "true"} />
            <button
              type="submit"
              className="text-sm font-medium text-zinc-700 underline disabled:opacity-60"
              disabled={pending}
            >
              {collapsed ? "Expand" : "Collapse"}
            </button>
          </form>
        }
      />
      {collapsed ? null : children}
    </section>
  );
}

export function WorkspaceCustomizePanel({
  customizableSections,
  hiddenSectionIds,
  preferredLandingSectionId,
  visibleSectionIds,
  sectionOrder,
}: {
  customizableSections: WorkspaceSectionId[];
  hiddenSectionIds: WorkspaceSectionId[];
  preferredLandingSectionId: WorkspaceSectionId | null;
  visibleSectionIds: WorkspaceSectionId[];
  sectionOrder: WorkspaceSectionId[];
}) {
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useState<Record<string, boolean>>(() => {
    const hidden = new Set(hiddenSectionIds);
    return Object.fromEntries(customizableSections.map((id) => [id, !hidden.has(id)]));
  });
  const [order, setOrder] = useState<WorkspaceSectionId[]>(() => {
    const visibleOptional = customizableSections.filter((id) => !hiddenSectionIds.includes(id));
    const preferred = sectionOrder.filter((id) => visibleOptional.includes(id));
    const rest = visibleOptional.filter((id) => !preferred.includes(id));
    return [...preferred, ...rest];
  });

  useEffect(() => {
    if (!preferredLandingSectionId) return;
    const el = document.getElementById(`workspace-section-${preferredLandingSectionId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [preferredLandingSectionId]);

  if (customizableSections.length === 0) return null;

  function moveOrder(id: WorkspaceSectionId, direction: -1 | 1) {
    setOrder((prev) => {
      const index = prev.indexOf(id);
      if (index < 0) return prev;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item!);
      return copy;
    });
  }

  return (
    <details
      className="rounded-xl border border-zinc-200 bg-white p-4"
      data-testid="workspace-customize"
    >
      <summary className="cursor-pointer text-sm font-semibold text-zinc-900">
        Customize Workspace
      </summary>
      <div className="mt-4 space-y-6">
        <form
          className="space-y-3"
          action={(formData) => {
            startTransition(() => {
              void updateWorkspaceHiddenSectionsAction(formData);
            });
          }}
        >
          <p className="text-sm text-zinc-600">Show optional sections for this facility:</p>
          <ul className="space-y-2">
            {customizableSections.map((id) => {
              const def = WORKSPACE_SECTION_DEFS.find((row) => row.id === id);
              return (
                <li key={id} className="flex items-center gap-2 text-sm text-zinc-800">
                  <input
                    type="checkbox"
                    id={`show-${id}`}
                    checked={shown[id] !== false}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setShown((prev) => ({ ...prev, [id]: checked }));
                      setOrder((prev) => {
                        if (checked) return prev.includes(id) ? prev : [...prev, id];
                        return prev.filter((row) => row !== id);
                      });
                    }}
                  />
                  <label htmlFor={`show-${id}`}>{def?.title ?? id}</label>
                  {shown[id] === false ? (
                    <input type="hidden" name="hiddenSectionId" value={id} />
                  ) : null}
                </li>
              );
            })}
          </ul>
          <button
            type="submit"
            className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm font-medium text-zinc-900 disabled:opacity-60"
            disabled={pending}
          >
            Save visibility
          </button>
        </form>

        <form
          className="space-y-3"
          action={(formData) => {
            startTransition(() => {
              void setWorkspaceSectionOrderAction(formData);
            });
          }}
        >
          <p className="text-sm text-zinc-600">Optional section order (core sections stay first):</p>
          <ul className="space-y-2">
            {order.map((id) => {
              const def = WORKSPACE_SECTION_DEFS.find((row) => row.id === id);
              return (
                <li key={id} className="flex items-center gap-2 text-sm text-zinc-800">
                  <input type="hidden" name="sectionOrderId" value={id} />
                  <span className="min-w-0 flex-1">{def?.title ?? id}</span>
                  <button
                    type="button"
                    className="rounded border border-zinc-300 px-2 py-0.5 text-xs"
                    onClick={() => moveOrder(id, -1)}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="rounded border border-zinc-300 px-2 py-0.5 text-xs"
                    onClick={() => moveOrder(id, 1)}
                  >
                    Down
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="submit"
            className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm font-medium text-zinc-900 disabled:opacity-60"
            disabled={pending}
          >
            Save order
          </button>
        </form>

        <form
          className="space-y-2"
          action={(formData) => {
            startTransition(() => {
              void setWorkspacePreferredLandingAction(formData);
            });
          }}
        >
          <label htmlFor="preferred-landing" className="block text-sm text-zinc-600">
            Preferred landing section
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              id="preferred-landing"
              name="sectionId"
              defaultValue={preferredLandingSectionId ?? "none"}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            >
              <option value="none">Top of page</option>
              {visibleSectionIds.map((id) => {
                const def = WORKSPACE_SECTION_DEFS.find((row) => row.id === id);
                return (
                  <option key={id} value={id}>
                    {def?.title ?? id}
                  </option>
                );
              })}
            </select>
            <button
              type="submit"
              className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm font-medium text-zinc-900 disabled:opacity-60"
              disabled={pending}
            >
              Save landing
            </button>
          </div>
        </form>
      </div>
    </details>
  );
}
