"use client";

import { useState, type ReactNode } from "react";

import { Drawer } from "@/components/drawer";
import { AppIcons } from "@/lib/design-system";
import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";

export function CompactWorkspaceMenu({
  children,
  testId = "compact-workspace-menu",
}: {
  children: ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        data-testid={testId}
        className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 xl:hidden ${FOCUS_RING_CLASS}`}
      >
        <AppIcons.menu className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
        <span>Menu</span>
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Menu" side="left" size="nav">
        <div onClick={() => setOpen(false)}>{children}</div>
      </Drawer>
    </>
  );
}
