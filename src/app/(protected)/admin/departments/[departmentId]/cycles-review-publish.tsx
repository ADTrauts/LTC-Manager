"use client";

import { useEffect, useRef, useState } from "react";

import { DepartmentAdminActionForm } from "@/app/(protected)/admin/departments/[departmentId]/action-form";
import { ScheduleActivationControls } from "@/app/(protected)/admin/departments/[departmentId]/cycles-builder-controls";
import { DiscardAllDraftsButton } from "@/app/(protected)/admin/departments/[departmentId]/discard-all-drafts-button";
import type { HierarchicalReviewPresentation } from "@/lib/operational-cycles/present-hierarchical-review";
import type { ReviewPublishIssue } from "@/lib/operational-cycles/review-publish-validation";
import { formatReviewPublishBlockerSummary } from "@/lib/operational-cycles/review-publish-validation";

export const REVIEW_PUBLISH_HASH = "review-publish";
export const EDIT_CYCLE_HASH_PREFIX = "edit-cycle-";

export function openCycleEditorFromReview(cycleId: string): void {
  if (typeof window === "undefined") return;
  window.location.hash = `${EDIT_CYCLE_HASH_PREFIX}${cycleId}:review`;
}

type Props = {
  departmentId: string;
  todayKey: string;
  nextDayKey: string;
  minDateKey: string;
  allowImmediate: boolean;
  scheduleAction: (formData: FormData) => Promise<
    | { ok: true; message?: string; cycleId?: string }
    | { ok: false; message: string; errors?: string[] }
  >;
  blockers: ReviewPublishIssue[];
  warnings: ReviewPublishIssue[];
  hierarchicalReview: HierarchicalReviewPresentation;
};

function IssueCard({
  issue,
  tone,
}: {
  issue: ReviewPublishIssue;
  tone: "error" | "warning";
}) {
  const border =
    tone === "error" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50";
  const titleColor = tone === "error" ? "text-red-950" : "text-amber-950";
  const bodyColor = tone === "error" ? "text-red-900" : "text-amber-900";

  return (
    <div
      className={`rounded-md border px-3 py-2.5 ${border}`}
      data-testid={`review-issue-${issue.code}`}
      data-stable-key={issue.stableKey}
    >
      <p className={`text-xs font-medium ${bodyColor}`}>{issue.displayPath}</p>
      <p className={`mt-0.5 text-sm font-semibold ${titleColor}`}>{issue.title}</p>
      <p className={`mt-1 text-sm ${bodyColor}`}>{issue.message}</p>
      {issue.consequence ? (
        <p className={`mt-1 text-xs ${bodyColor}`}>{issue.consequence}</p>
      ) : null}
      <button
        type="button"
        className={`mt-2 rounded-md px-2.5 py-1 text-xs font-medium ${
          tone === "error"
            ? "bg-red-900 text-white hover:bg-red-800"
            : "bg-amber-900 text-white hover:bg-amber-800"
        }`}
        data-testid={`review-fix-${issue.stableKey}`}
        onClick={() => openCycleEditorFromReview(issue.fixTarget.cycleId)}
      >
        {issue.fixLabel}
      </button>
    </div>
  );
}

function BranchBlock({
  branch,
  defaultOpen,
}: {
  branch: HierarchicalReviewPresentation["branches"][number];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className="rounded-md border border-zinc-200 bg-white"
      data-testid={`review-branch-${branch.stableKey}`}
    >
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>
          <span className="text-sm font-semibold text-zinc-900">
            {open ? "▾ " : "▸ "}
            {branch.label}
          </span>
          <span className="mt-0.5 block text-xs text-zinc-500">
            {[branch.window, branch.roomSummary].filter(Boolean).join(" · ")}
          </span>
        </span>
      </button>
      {open ? (
        <div className="space-y-2 border-t border-zinc-100 px-3 py-2">
          {branch.bullets.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-4 text-sm text-zinc-700">
              {branch.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          ) : null}
          {branch.children.length > 0 ? (
            <ul className="space-y-1.5 border-l border-zinc-200 pl-3">
              {branch.children.map((child) => (
                <li key={child.stableKey} className="text-sm text-zinc-700">
                  <span className="font-medium text-zinc-900">{child.label}</span>
                  <span className="mt-0.5 block text-xs text-zinc-500">{child.summary}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ReadinessSummary({
  blockers,
  warnings,
  changeCount,
  summaryRef,
}: {
  blockers: ReviewPublishIssue[];
  warnings: ReviewPublishIssue[];
  changeCount: number;
  summaryRef: React.RefObject<HTMLDivElement | null>;
}) {
  const ready = blockers.length === 0;
  const noChanges = changeCount === 0;
  const summary = noChanges
    ? "No changes to publish"
    : formatReviewPublishBlockerSummary({
        valid: ready,
        blockers,
        warnings,
      });

  return (
    <div
      ref={summaryRef}
      id="cycles-review-readiness"
      tabIndex={-1}
      className={`rounded-md border px-3 py-3 ${
        noChanges
          ? "border-zinc-200 bg-zinc-50"
          : ready
            ? "border-emerald-200 bg-emerald-50"
            : "border-red-200 bg-red-50"
      }`}
      data-testid="cycles-review-readiness"
      data-review-ready={noChanges ? "no-changes" : ready ? "ready" : "blocked"}
    >
      <p
        className={`text-sm font-semibold ${
          noChanges ? "text-zinc-900" : ready ? "text-emerald-950" : "text-red-950"
        }`}
      >
        {summary}
      </p>
      <p
        className={`mt-1 text-sm ${
          noChanges ? "text-zinc-600" : ready ? "text-emerald-900" : "text-red-900"
        }`}
      >
        {noChanges
          ? "This draft matches the current configuration."
          : ready
            ? `${changeCount} change${changeCount === 1 ? "" : "s"} reviewed. No configuration issues found.`
            : "Fix these items before publishing."}
      </p>
      {blockers.length > 0 ? (
        <div className="mt-3 space-y-2">
          {blockers.map((issue) => (
            <IssueCard
              key={`${issue.code}-${issue.stableKey}-${issue.title}`}
              issue={issue}
              tone="error"
            />
          ))}
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <div className="mt-3 space-y-2" data-testid="cycles-review-warnings">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-900">Warnings</p>
          {warnings.map((issue) => (
            <IssueCard key={`${issue.code}-${issue.stableKey}`} issue={issue} tone="warning" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CyclesReviewPublishPanel({
  departmentId,
  todayKey,
  nextDayKey,
  minDateKey,
  allowImmediate,
  scheduleAction,
  blockers,
  warnings,
  hierarchicalReview,
}: Props) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const hasBlockers = blockers.length > 0;
  const noChanges =
    hierarchicalReview.mode === "empty" || hierarchicalReview.changeCount === 0;

  useEffect(() => {
    function onHash() {
      if (typeof window === "undefined") return;
      if (window.location.hash === `#${REVIEW_PUBLISH_HASH}`) {
        if (detailsRef.current) detailsRef.current.open = true;
        summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        summaryRef.current?.focus();
      }
    }
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (hasBlockers && detailsRef.current) {
      detailsRef.current.open = true;
    }
  }, [hasBlockers]);

  function focusBlockers() {
    if (detailsRef.current) detailsRef.current.open = true;
    summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    summaryRef.current?.focus();
  }

  return (
    <details
      ref={detailsRef}
      className="border-t border-zinc-200/80 bg-transparent px-0 py-3"
      data-testid="cycles-review-schedule"
      id={REVIEW_PUBLISH_HASH}
      open={hasBlockers || noChanges || undefined}
    >
      <summary className="cursor-pointer text-sm font-medium text-zinc-900">
        Review &amp; publish changes
      </summary>
      <div className="mt-3 space-y-4">
        <ReadinessSummary
          blockers={blockers}
          warnings={warnings}
          changeCount={hierarchicalReview.changeCount}
          summaryRef={summaryRef}
        />

        <div data-testid="cycles-review">
          <p className="text-xs font-medium text-zinc-700">Changes</p>
          {noChanges ? (
            <p className="mt-1 text-sm text-zinc-500">No field differences detected.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {hierarchicalReview.branches.map((branch) => (
                <BranchBlock
                  key={branch.stableKey}
                  branch={branch}
                  defaultOpen={!branch.collapsedByDefault}
                />
              ))}
            </div>
          )}
        </div>

        {noChanges ? (
          <div className="space-y-2 border-t border-zinc-100 pt-3">
            <p className="text-sm text-zinc-600">
              There is nothing to publish. Discard the draft if you do not need it.
            </p>
            <DiscardAllDraftsButton departmentId={departmentId} hasChanges={false} />
          </div>
        ) : (
          <DepartmentAdminActionForm
            action={async (formData) => {
              if (hasBlockers) {
                focusBlockers();
                return {
                  ok: false,
                  message: formatReviewPublishBlockerSummary({
                    valid: false,
                    blockers,
                    warnings,
                  }),
                };
              }
              return scheduleAction(formData);
            }}
            className="space-y-3 border-t border-zinc-100 pt-3"
          >
            <input type="hidden" name="departmentId" value={departmentId} />
            <ScheduleActivationControls
              todayKey={todayKey}
              nextDayKey={nextDayKey}
              minDateKey={allowImmediate ? todayKey : minDateKey}
              allowImmediate={allowImmediate}
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type={hasBlockers ? "button" : "submit"}
                disabled={hasBlockers}
                onClick={hasBlockers ? focusBlockers : undefined}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
                data-testid="schedule-cycle-changes"
              >
                Publish changes
              </button>
              <DiscardAllDraftsButton
                departmentId={departmentId}
                hasChanges
                label="Discard draft"
              />
            </div>
            {hasBlockers ? (
              <p className="text-xs text-red-800">Resolve the items above before publishing.</p>
            ) : null}
          </DepartmentAdminActionForm>
        )}
      </div>
    </details>
  );
}
