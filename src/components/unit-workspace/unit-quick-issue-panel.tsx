"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { IssueType, RepairPriority } from "@prisma/client";

import { createUnitIssueAction } from "@/app/(protected)/unit/[unitId]/actions";
import { Drawer } from "@/components/drawer";
import { ISSUE_TYPE_OPTIONS } from "@/lib/repair-routing";
import { issueDetailPath } from "@/lib/work/issues/issue-copy";

type UnitAssetOption = {
  id: string;
  name: string;
};

type UnitQuickIssuePanelProps = {
  unitId: string;
  unitName: string;
  assets: UnitAssetOption[];
};

const PRIORITY_OPTIONS: Array<{ value: RepairPriority; label: string }> = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

export function UnitQuickIssuePanel({ unitId, unitName, assets }: UnitQuickIssuePanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [issueType, setIssueType] = useState<IssueType>("EQUIPMENT");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<RepairPriority>("MEDIUM");
  const [assetId, setAssetId] = useState("");
  const [quantityNote, setQuantityNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ text: string; issueId: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedHint = useMemo(
    () => ISSUE_TYPE_OPTIONS.find((option) => option.value === issueType)?.hint ?? "",
    [issueType],
  );

  const titleLabel =
    issueType === "SUPPLY_SHORT" ? "What are you short on?" : "What is the problem?";
  const titlePlaceholder =
    issueType === "SUPPLY_SHORT"
      ? "e.g. Sanitizer test strips"
      : "e.g. Dishwasher not heating";

  function resetForm() {
    setIssueType("EQUIPMENT");
    setTitle("");
    setDescription("");
    setPriority("MEDIUM");
    setAssetId("");
    setQuantityNote("");
    setError(null);
  }

  function close() {
    setOpen(false);
    setError(null);
  }

  return (
    <div className="space-y-2" data-testid="unit-quick-issue">
      {success ? (
        <div
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900"
          data-testid="unit-issue-success"
        >
          <p>{success.text}</p>
          <p className="mt-1">
            <Link
              href={issueDetailPath(success.issueId)}
              className="font-semibold underline hover:text-emerald-700"
            >
              View issue
            </Link>
          </p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          setSuccess(null);
          setOpen(true);
        }}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-md border-2 border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 touch-manipulation hover:bg-zinc-50 sm:w-auto"
      >
        Report an issue
      </button>

      <Drawer open={open} onClose={close} title="Report an issue">
        <form
          className="space-y-4"
          data-testid="unit-quick-issue-form"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            const formData = new FormData();
            formData.set("unitId", unitId);
            formData.set("issueType", issueType);
            formData.set("title", title);
            formData.set("description", description);
            formData.set("priority", priority);
            if (assetId) formData.set("assetId", assetId);
            if (quantityNote.trim()) formData.set("quantityNote", quantityNote.trim());

            startTransition(async () => {
              const result = await createUnitIssueAction(formData);
              if (!result.ok) {
                setError(result.message);
                return;
              }
              setSuccess({
                text: `Issue reported (${result.repairCode}): ${result.title}. It is now in the work queue.`,
                issueId: result.issueId,
              });
              resetForm();
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <p className="text-sm text-zinc-600">
            Reporting for <span className="font-semibold text-zinc-900">{unitName}</span>. Keep it
            short — under 30 seconds.
          </p>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-zinc-800">Issue type</legend>
            <div className="grid grid-cols-2 gap-2">
              {ISSUE_TYPE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex min-h-12 cursor-pointer items-center justify-center rounded-md border px-2 text-center text-sm font-semibold touch-manipulation ${
                    issueType === option.value
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300 bg-white text-zinc-800"
                  }`}
                >
                  <input
                    type="radio"
                    name="issueType"
                    value={option.value}
                    checked={issueType === option.value}
                    onChange={() => setIssueType(option.value)}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <p className="text-xs text-zinc-500">{selectedHint}</p>
          </fieldset>

          <label className="block text-sm font-medium text-zinc-800">
            {titleLabel}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={3}
              maxLength={120}
              placeholder={titlePlaceholder}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-3 text-base"
            />
          </label>

          {issueType === "SUPPLY_SHORT" ? (
            <label className="block text-sm font-medium text-zinc-800">
              Quantity or urgency (optional)
              <input
                value={quantityNote}
                onChange={(e) => setQuantityNote(e.target.value)}
                maxLength={80}
                placeholder="e.g. Need today · about 2 boxes"
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-3 text-base"
              />
            </label>
          ) : null}

          <label className="block text-sm font-medium text-zinc-800">
            Brief description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              minLength={5}
              maxLength={1000}
              rows={3}
              placeholder="What happened and what do you need?"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-3 text-base"
            />
          </label>

          <label className="block text-sm font-medium text-zinc-800">
            Priority
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as RepairPriority)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-3 text-base"
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {issueType === "EQUIPMENT" && assets.length > 0 ? (
            <label className="block text-sm font-medium text-zinc-800">
              Related equipment (optional)
              <select
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-3 text-base"
              >
                <option value="">None</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-semibold text-white touch-manipulation disabled:opacity-60"
            >
              {pending ? "Submitting…" : "Submit issue"}
            </button>
            <button
              type="button"
              onClick={close}
              disabled={pending}
              className="inline-flex min-h-12 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 touch-manipulation"
            >
              Cancel
            </button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
