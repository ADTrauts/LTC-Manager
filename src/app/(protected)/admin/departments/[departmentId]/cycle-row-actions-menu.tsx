"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

import { DepartmentAdminActionForm } from "@/app/(protected)/admin/departments/[departmentId]/action-form";
import {
  deleteCycleDraftAction,
  duplicateCycleAction,
  retireCycleAction,
} from "@/app/(protected)/admin/departments/[departmentId]/cycle-actions";

export type CycleRowActionKind =
  | "delete-draft-root"
  | "delete-draft-phase"
  | "delete-draft-key-time"
  | "edit-current"
  | "retire-current";

type Props = {
  departmentId: string;
  cycleId: string;
  objectLabel: string;
  /** Accessible name, e.g. "Actions for Dinner" */
  ariaLabel: string;
  actions: CycleRowActionKind[];
};

function confirmDelete(kind: CycleRowActionKind, label: string): boolean {
  if (kind === "delete-draft-root") {
    return window.confirm(
      `Delete “${label}”?\n\nThis cycle has not been published and will be permanently removed.`,
    );
  }
  if (kind === "delete-draft-phase") {
    return window.confirm(`Delete phase “${label}”? This unpublished phase will be permanently removed.`);
  }
  if (kind === "delete-draft-key-time") {
    return window.confirm(
      `Delete key time “${label}”? This unpublished key time will be permanently removed.`,
    );
  }
  if (kind === "retire-current") {
    return window.confirm(
      `Retire “${label}”? It will stop being active going forward. History is preserved.`,
    );
  }
  return true;
}

function deleteLabel(kind: CycleRowActionKind): string {
  if (kind === "delete-draft-root") return "Delete draft cycle";
  if (kind === "delete-draft-phase") return "Delete phase";
  if (kind === "delete-draft-key-time") return "Delete key time";
  return "Delete";
}

/**
 * Compact ••• menu for cycle row lifecycle actions.
 * Row click remains Edit/open; this hosts secondary actions.
 */
export function CycleRowActionsMenu({
  departmentId,
  cycleId,
  objectLabel,
  ariaLabel,
  actions,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <div className="relative shrink-0" ref={rootRef} data-testid="cycle-row-actions">
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        data-testid="cycle-row-actions-trigger"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-md border border-zinc-200 bg-white py-1 shadow-md"
        >
          {actions.includes("edit-current") ? (
            <MenuActionForm
              action={duplicateCycleAction}
              departmentId={departmentId}
              cycleId={cycleId}
              onDone={() => setOpen(false)}
              openCycleEditorOnSuccess
            >
              <button
                type="submit"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-50"
                data-testid="cycle-action-edit"
                onClick={(e) => e.stopPropagation()}
              >
                Edit
              </button>
            </MenuActionForm>
          ) : null}
          {actions.includes("retire-current") ? (
            <MenuActionForm
              action={retireCycleAction}
              departmentId={departmentId}
              cycleId={cycleId}
              onDone={() => setOpen(false)}
            >
              <button
                type="submit"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-50"
                data-testid="cycle-action-retire"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!confirmDelete("retire-current", objectLabel)) {
                    e.preventDefault();
                  }
                }}
              >
                Retire
              </button>
            </MenuActionForm>
          ) : null}
          {actions
            .filter(
              (a): a is "delete-draft-root" | "delete-draft-phase" | "delete-draft-key-time" =>
                a.startsWith("delete-draft"),
            )
            .map((kind) => (
              <MenuActionForm
                key={kind}
                action={deleteCycleDraftAction}
                departmentId={departmentId}
                cycleId={cycleId}
                onDone={() => setOpen(false)}
              >
                <button
                  type="submit"
                  role="menuitem"
                  className="block w-full px-3 py-2 text-left text-sm text-red-800 hover:bg-red-50"
                  data-testid="cycle-action-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!confirmDelete(kind, objectLabel)) {
                      e.preventDefault();
                    }
                  }}
                >
                  {deleteLabel(kind)}
                </button>
              </MenuActionForm>
            ))}
        </div>
      ) : null}
    </div>
  );
}

function MenuActionForm({
  action,
  departmentId,
  cycleId,
  children,
  onDone,
  openCycleEditorOnSuccess,
}: {
  action: (
    formData: FormData,
  ) => Promise<
    | { ok: true; message?: string; cycleId?: string }
    | { ok: false; message: string; errors?: string[] }
  >;
  departmentId: string;
  cycleId: string;
  children: ReactNode;
  onDone: () => void;
  openCycleEditorOnSuccess?: boolean;
}) {
  return (
    <DepartmentAdminActionForm
      action={async (formData) => {
        const result = await action(formData);
        onDone();
        return result;
      }}
      openCycleEditorOnSuccess={openCycleEditorOnSuccess}
    >
      <input type="hidden" name="departmentId" value={departmentId} />
      <input type="hidden" name="cycleId" value={cycleId} />
      {children}
    </DepartmentAdminActionForm>
  );
}
