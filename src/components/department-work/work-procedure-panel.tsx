"use client";

import { useState } from "react";

/**
 * Tablet-friendly read-only Procedure view.
 * Opening / reading a Procedure never completes Work.
 */
export function WorkProcedurePanel(props: {
  title: string;
  body: string;
  summary?: string | null;
  workLabel?: string | null;
}) {
  const [open, setOpen] = useState(true);
  if (!open) {
    return (
      <button
        type="button"
        className="rounded-md border px-3 py-2 text-sm"
        data-testid="work-procedure-reopen"
        onClick={() => setOpen(true)}
      >
        Show procedure
      </button>
    );
  }

  return (
    <aside
      className="max-h-[70vh] overflow-auto rounded-md border bg-white p-4 shadow-sm"
      data-testid="work-procedure-panel"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Procedure</p>
          <h2 className="text-lg font-semibold text-slate-900" data-testid="work-procedure-title">
            {props.title}
          </h2>
          {props.workLabel ? (
            <p className="text-xs text-slate-600">Linked work: {props.workLabel}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="rounded-md border px-2 py-1 text-xs"
          data-testid="work-procedure-close"
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </div>
      {props.summary ? (
        <p className="mb-3 text-sm text-slate-700" data-testid="work-procedure-summary">
          {props.summary}
        </p>
      ) : null}
      <div
        className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800"
        data-testid="work-procedure-body"
      >
        {props.body}
      </div>
      <p className="mt-4 text-xs text-slate-500" data-testid="work-procedure-non-completion-note">
        Viewing this procedure does not complete the work step.
      </p>
    </aside>
  );
}
