"use client";

import { useEffect, useId } from "react";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
};

export function Drawer({ open, onClose, title, children }: DrawerProps) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="Close panel"
      />
      <div className="absolute inset-y-0 right-0 flex w-full min-w-0 max-w-2xl flex-col border-l border-zinc-200 bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 id={titleId} className="text-lg font-semibold text-zinc-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
