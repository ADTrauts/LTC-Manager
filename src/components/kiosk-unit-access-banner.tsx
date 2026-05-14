"use client";

import { useState } from "react";

export function KioskUnitAccessBanner({ unitName }: { unitName: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 lg:px-6"
      role="status"
    >
      <div className="mx-auto flex max-w-[1440px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p>
          <span className="font-medium">Unit tablet:</span> you are not usually assigned to{" "}
          <span className="font-medium">{unitName}</span>. You can continue working here; this sign-in was recorded for
          your manager.
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
