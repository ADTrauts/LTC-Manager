"use client";

import { useState, type ReactNode } from "react";

import { EmptyState } from "@/components/design-system";
import { GuardedModal } from "@/components/guarded-modal";
import { MaintenanceSubNav } from "@/components/maintenance-sub-nav";
import type { AppRole } from "@/lib/access";

type Props = {
  role: AppRole;
  isEmpty: boolean;
  createForm: ReactNode;
  children: ReactNode;
};

export function RepairsPageClient({ role, isEmpty, createForm, children }: Props) {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  function openCreate() {
    setDirty(false);
    setOpen(true);
  }

  function closeCreate() {
    setOpen(false);
    setDirty(false);
  }

  return (
    <div className="space-y-4" data-testid="repairs-shell">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Maintenance</h1>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex min-h-9 items-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            data-testid="repairs-create-open"
            aria-expanded={open}
          >
            New repair
          </button>
        </div>
        <MaintenanceSubNav role={role} activeId="repairs" />
      </header>

      {children}

      {isEmpty ? (
        <EmptyState
          icon="repairs"
          title="No repairs yet"
          description="Open work will show here once a repair is created."
          action={
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex min-h-10 items-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-700"
              data-testid="repairs-empty-create"
            >
              New repair
            </button>
          }
        />
      ) : null}

      <GuardedModal
        open={open}
        title="New repair"
        dirty={dirty}
        onClose={closeCreate}
        data-testid="repairs-create-modal"
      >
        <div onInput={() => setDirty(true)} onChange={() => setDirty(true)}>
          {createForm}
        </div>
      </GuardedModal>
    </div>
  );
}
