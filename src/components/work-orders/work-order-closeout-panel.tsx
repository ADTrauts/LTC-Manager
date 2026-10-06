"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  formatWorkOrderCloseoutBlockedMessage,
  validateWorkOrderCloseout,
  type RepairAssetConditionReviewChoice,
} from "@/lib/asset-operations/work-order-closeout-gate";
import {
  addWorkOrderLaborAction,
  addWorkOrderPartAction,
  addWorkOrderRecordRequirementAction,
  completeWorkOrderAction,
  removeWorkOrderLaborAction,
  removeWorkOrderPartAction,
  removeWorkOrderRecordRequirementAction,
  satisfyWorkOrderRecordRequirementAction,
  setWorkOrderExternalCostAction,
  waiveWorkOrderRecordRequirementAction,
} from "@/app/(protected)/repairs/actions";

type LaborRow = {
  id: string;
  minutes: number;
  employeeName: string;
  employeeId: string;
};

type PartRow = {
  id: string;
  description: string;
  partNumber: string | null;
  quantity: string;
  lineCost: string | null;
};

type RequirementRow = {
  id: string;
  templateName: string;
  templateVersion: number;
  status: string;
  waiveReason: string | null;
  satisfiedStatus: string | null;
  outOfStandard: boolean;
};

type TemplateOption = { id: string; name: string; version: number };
type VendorOption = { id: string; name: string };
type EmployeeOption = { id: string; name: string };

type Props = {
  repairId: string;
  departmentId: string;
  issueId?: string | null;
  status: string;
  completed: boolean;
  canExecute: boolean;
  canSupervise: boolean;
  hasAsset: boolean;
  workPerformed: string;
  labor: LaborRow[];
  laborTotalMinutes: number;
  parts: PartRow[];
  requirements: RequirementRow[];
  templates: TemplateOption[];
  vendors: VendorOption[];
  employees: EmployeeOption[];
  vendorId: string | null;
  vendorName: string | null;
  externalCost: string | null;
  externalCostNote: string | null;
  recordedExpense: string | null;
  assetReview: string | null;
  missing: string[];
};

const REVIEW_OPTIONS = [
  ["NO_CHANGE", "No change"],
  ["OPERATIONAL", "Operational"],
  ["DEGRADED", "Degraded"],
  ["OUT_OF_SERVICE", "Out of service"],
] as const;

function requirementLabel(status: string) {
  if (status === "SATISFIED") return "Satisfied";
  if (status === "WAIVED") return "Waived";
  return "Pending";
}

export function WorkOrderCloseoutPanel(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [workPerformed, setWorkPerformed] = useState(props.workPerformed);
  const [laborMinutes, setLaborMinutes] = useState(
    props.labor[0] ? String(props.labor[0].minutes) : "",
  );
  const [assetReview, setAssetReview] = useState(props.assetReview ?? "");

  function hidden(fd: FormData) {
    fd.set("repairId", props.repairId);
    fd.set("departmentId", props.departmentId);
    if (props.issueId) fd.set("issueId", props.issueId);
  }

  function run(action: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed.");
      }
    });
  }

  return (
    <section className="space-y-5" data-testid="work-order-closeout">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-zinc-900">Labor</h3>
        {props.labor.length === 0 ? (
          <p className="text-sm text-zinc-600" data-testid="wo-labor-empty">
            No labor recorded.
          </p>
        ) : (
          <ul className="space-y-1 text-sm" data-testid="wo-labor-list">
            {props.labor.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-2">
                <span>
                  {row.employeeName}: {row.minutes} minutes
                </span>
                {props.canExecute && (!props.completed || props.canSupervise) ? (
                  <button
                    type="button"
                    className="text-xs underline"
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        const fd = new FormData();
                        hidden(fd);
                        fd.set("laborEntryId", row.id);
                        await removeWorkOrderLaborAction(fd);
                      })
                    }
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
            <li className="font-medium" data-testid="wo-labor-total">
              Labor {props.laborTotalMinutes} minutes
            </li>
          </ul>
        )}
        {props.canExecute && (!props.completed || props.canSupervise) ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              hidden(fd);
              run(() => addWorkOrderLaborAction(fd));
            }}
          >
            {props.canSupervise ? (
              <label className="text-xs text-zinc-600">
                Employee
                <select
                  name="employeeId"
                  className="mt-1 block rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                  data-testid="wo-labor-employee"
                >
                  <option value="">Assigned / self</option>
                  {props.employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="text-xs text-zinc-600">
              Labor time
              <input
                name="minutes"
                inputMode="numeric"
                value={laborMinutes}
                onChange={(e) => setLaborMinutes(e.target.value)}
                className="mt-1 block w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                data-testid="wo-labor-minutes"
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
              data-testid="wo-labor-save"
            >
              Save labor
            </button>
          </form>
        ) : null}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-zinc-900">Parts used</h3>
        {props.parts.length === 0 ? (
          <p className="text-sm text-zinc-600">No parts recorded.</p>
        ) : (
          <ul className="space-y-1 text-sm" data-testid="wo-parts-list">
            {props.parts.map((part) => (
              <li key={part.id} className="flex flex-wrap items-center gap-2">
                <span>
                  {part.description}
                  {part.partNumber ? ` ${part.partNumber}` : ""} · Qty {part.quantity}
                  {part.lineCost ? ` · Recorded cost ${part.lineCost}` : ""}
                </span>
                {props.canExecute && (!props.completed || props.canSupervise) ? (
                  <button
                    type="button"
                    className="text-xs underline"
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        const fd = new FormData();
                        hidden(fd);
                        fd.set("partId", part.id);
                        await removeWorkOrderPartAction(fd);
                      })
                    }
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {props.canExecute && (!props.completed || props.canSupervise) ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              hidden(fd);
              run(async () => {
                await addWorkOrderPartAction(fd);
                e.currentTarget.reset();
              });
            }}
          >
            <input
              name="description"
              required
              placeholder="Description"
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              data-testid="wo-part-description"
            />
            <input
              name="partNumber"
              placeholder="Part number"
              className="w-28 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              data-testid="wo-part-number"
            />
            <input
              name="quantity"
              required
              placeholder="Qty"
              defaultValue="1"
              className="w-20 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              data-testid="wo-part-quantity"
            />
            <input
              name="lineCost"
              placeholder="Recorded cost"
              className="w-28 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              data-testid="wo-part-cost"
            />
            <button
              type="submit"
              disabled={pending}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
              data-testid="wo-part-add"
            >
              Add part
            </button>
          </form>
        ) : null}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-zinc-900">Required evidence</h3>
        {props.requirements.length === 0 ? (
          <p className="text-sm text-zinc-600">No required Records.</p>
        ) : (
          <ul className="space-y-3 text-sm" data-testid="wo-required-evidence">
            {props.requirements.map((requirement) => (
              <li
                key={requirement.id}
                className="rounded-md border border-zinc-200 px-3 py-2"
                data-testid={`wo-requirement-${requirement.status.toLowerCase()}`}
              >
                <p>
                  {requirement.templateName} v{requirement.templateVersion} ·{" "}
                  <span data-testid="wo-requirement-status">
                    {requirementLabel(requirement.status)}
                  </span>
                </p>
                {requirement.status === "SATISFIED" && requirement.outOfStandard ? (
                  <p className="text-xs text-amber-800">
                    Completed with corrective action / out of standard. This satisfies evidence; it
                    does not mean the Issue is resolved.
                  </p>
                ) : null}
                {requirement.status === "WAIVED" && requirement.waiveReason ? (
                  <p className="text-xs text-zinc-600">Waiver: {requirement.waiveReason}</p>
                ) : null}
                {requirement.status === "PENDING" && props.canExecute && !props.completed ? (
                  <form
                    className="mt-2 flex flex-wrap gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      hidden(fd);
                      fd.set("requirementId", requirement.id);
                      run(() => satisfyWorkOrderRecordRequirementAction(fd));
                    }}
                  >
                    <input
                      name="evidenceRecordId"
                      placeholder="Completed Record ID"
                      className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                      data-testid="wo-satisfy-record-id"
                    />
                    <button
                      type="submit"
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
                      data-testid="wo-satisfy-record"
                    >
                      Satisfy
                    </button>
                  </form>
                ) : null}
                {requirement.status === "PENDING" && props.canSupervise && !props.completed ? (
                  <form
                    className="mt-2 flex flex-wrap gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      hidden(fd);
                      fd.set("requirementId", requirement.id);
                      run(() => waiveWorkOrderRecordRequirementAction(fd));
                    }}
                  >
                    <input
                      name="waiveReason"
                      placeholder="Waiver reason"
                      className="min-w-[12rem] rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                      data-testid="wo-waive-reason"
                    />
                    <button
                      type="submit"
                      className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
                      data-testid="wo-waive-requirement"
                    >
                      Waive
                    </button>
                    <button
                      type="button"
                      className="text-xs underline"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          const fd = new FormData();
                          hidden(fd);
                          fd.set("requirementId", requirement.id);
                          await removeWorkOrderRecordRequirementAction(fd);
                        })
                      }
                    >
                      Remove
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {props.canSupervise && !props.completed ? (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              hidden(fd);
              run(() => addWorkOrderRecordRequirementAction(fd));
            }}
          >
            <select
              name="templateId"
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              data-testid="wo-requirement-template"
            >
              <option value="">Published Record template</option>
              {props.templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} v{template.version}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
              data-testid="wo-requirement-add"
            >
              Add required Record
            </button>
          </form>
        ) : null}
      </div>

      {props.canSupervise ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-900">
            Recorded material & vendor expense
          </h3>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              hidden(fd);
              run(() => setWorkOrderExternalCostAction(fd));
            }}
          >
            <label className="text-xs text-zinc-600">
              Vendor
              <select
                name="vendorId"
                defaultValue={props.vendorId ?? ""}
                className="mt-1 block rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                data-testid="wo-vendor"
              >
                <option value="">None</option>
                {props.vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-600">
              External cost
              <input
                name="externalCost"
                defaultValue={props.externalCost ?? ""}
                className="mt-1 block w-28 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                data-testid="wo-external-cost"
              />
            </label>
            <input
              name="externalCostNote"
              defaultValue={props.externalCostNote ?? ""}
              placeholder="Note"
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
              data-testid="wo-external-cost-note"
            />
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
              data-testid="wo-external-cost-save"
            >
              Save expense
            </button>
          </form>
        </div>
      ) : null}

      {props.completed ? (
        <div className="space-y-1 text-sm" data-testid="wo-closeout-summary">
          <p data-testid="wo-work-performed-display">
            Work performed: {props.workPerformed || "—"}
          </p>
          {props.vendorName ? <p>External service: {props.vendorName}</p> : null}
          {props.recordedExpense ? (
            <p data-testid="wo-recorded-expense">
              Recorded material & vendor expense {props.recordedExpense}
            </p>
          ) : null}
          {props.hasAsset ? (
            <p data-testid="wo-asset-review-display">
              Asset condition review: {props.assetReview ?? "—"}
            </p>
          ) : (
            <p>Location-only work. No Asset condition review.</p>
          )}
        </div>
      ) : props.canExecute ? (
        <div className="space-y-3">
          <label className="block text-sm">
            Work performed
            <textarea
              value={workPerformed}
              onChange={(e) => setWorkPerformed(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              data-testid="wo-work-performed"
            />
          </label>
          {props.hasAsset ? (
            <fieldset className="space-y-1" data-testid="wo-asset-review">
              <legend className="text-sm font-semibold text-zinc-900">
                Asset condition review
              </legend>
              {REVIEW_OPTIONS.map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="assetConditionReview"
                    value={value}
                    checked={assetReview === value}
                    onChange={() => setAssetReview(value)}
                    data-testid={`wo-asset-review-${value}`}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          ) : (
            <p className="text-sm text-zinc-600">Location-only work. Asset review is not required.</p>
          )}
          {props.missing.length > 0 ? (
            <div
              className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
              data-testid="wo-closeout-missing"
            >
              <p className="font-medium">Cannot complete Work Order</p>
              <p>Still required:</p>
              <ul className="list-disc pl-5">
                {props.missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <button
            type="button"
            disabled={pending || props.status === "COMPLETED"}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() =>
              run(async () => {
                const validation = validateWorkOrderCloseout({
                  workPerformed,
                  laborEntryCount: props.labor.length,
                  requirements: props.requirements,
                  hasAsset: props.hasAsset,
                  assetConditionReview: (assetReview ||
                    null) as RepairAssetConditionReviewChoice | null,
                });
                if (!validation.canComplete) {
                  throw new Error(formatWorkOrderCloseoutBlockedMessage(validation));
                }
                const fd = new FormData();
                hidden(fd);
                fd.set("workPerformed", workPerformed);
                if (assetReview) fd.set("assetConditionReview", assetReview);
                await completeWorkOrderAction(fd);
              })
            }
            data-testid="wo-complete"
          >
            Complete Work Order
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="whitespace-pre-wrap text-sm text-red-700" data-testid="wo-closeout-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
