"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { DepartmentAdminActionForm } from "@/app/(protected)/admin/departments/[departmentId]/action-form";
import {
  createCoverageExpectationAction,
  publishCoverageExpectationAction,
  removeCoverageExpectationItemAction,
  updateCoverageExpectationAction,
  upsertCoverageExpectationItemAction,
} from "@/app/(protected)/admin/departments/[departmentId]/coverage-actions";
import { Button } from "@/components/design-system/Button";
import { EmptyState } from "@/components/design-system/EmptyState";
import { Select, TextArea, TextInput } from "@/components/design-system/Field";
import { Drawer } from "@/components/drawer";
import { StatusBadge } from "@/components/design-system";
import { departmentAdminHref } from "@/lib/department-administration/admin-nav";
import type {
  CoverageCatalog,
  CoverageExpectationView,
} from "@/lib/scheduling/coverage-expectations/views";

type Props = {
  departmentId: string;
  departmentName: string;
  expectations: CoverageExpectationView[];
  catalog: CoverageCatalog;
  canManage: boolean;
  selectedExpectationId: string | null;
};

function statusVariant(status: CoverageExpectationView["status"]): "neutral" | "success" | "warning" {
  if (status === "PUBLISHED") return "success";
  if (status === "RETIRED") return "warning";
  return "neutral";
}

export function CoverageWorkspace({
  departmentId,
  departmentName,
  expectations,
  catalog,
  canManage,
  selectedExpectationId,
}: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const selected = expectations.find((row) => row.id === selectedExpectationId) ?? null;

  function openExpectation(id: string | null) {
    const href = id
      ? `${departmentAdminHref(departmentId, "coverage")}&expectation=${encodeURIComponent(id)}`
      : departmentAdminHref(departmentId, "coverage");
    router.push(href);
  }

  return (
    <div className="max-w-5xl space-y-3" data-testid="department-coverage-panel">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h2 className="text-base font-semibold text-zinc-900">Coverage</h2>
          <p className="text-sm text-zinc-600">
            Expected operational responsibilities for {departmentName}. Draft edits do not change
            today’s Run until they are published.
          </p>
        </div>
        {canManage ? (
          <Button
            type="button"
            size="compact"
            className="self-start shrink-0"
            onClick={() => {
              setAdding(true);
              openExpectation(null);
            }}
            data-testid="add-coverage-expectation"
          >
            + Add expectation
          </Button>
        ) : null}
      </div>

      {expectations.length === 0 && !adding ? (
        <EmptyState
          title="No coverage expectations yet"
          description="Define which operational responsibilities are required for each Operational Type and Operational Cycle."
          action={
            canManage ? (
              <Button type="button" onClick={() => setAdding(true)} data-testid="add-coverage-empty">
                + Add expectation
              </Button>
            ) : undefined
          }
          data-testid="department-coverage-empty"
        />
      ) : null}

      {expectations.length > 0 ? (
        <ul className="divide-y divide-zinc-100" data-testid="coverage-expectation-list">
          {expectations.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => openExpectation(row.id)}
                className={`flex w-full items-center gap-3 py-3 text-left transition-colors hover:bg-zinc-50 ${
                  selectedExpectationId === row.id ? "bg-amber-50/60" : ""
                }`}
                data-testid="coverage-expectation-row"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-zinc-900">{row.name}</span>
                  <span className="block text-xs text-zinc-600">
                    {row.items.length} {row.items.length === 1 ? "requirement" : "requirements"}
                    {row.effectiveFrom ? ` · Effective ${row.effectiveFrom}` : ""}
                  </span>
                </span>
                <StatusBadge variant={statusVariant(row.status)}>{row.status}</StatusBadge>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Drawer
        open={adding || Boolean(selected)}
        onClose={() => {
          setAdding(false);
          openExpectation(null);
        }}
        title={selected ? selected.name : "New coverage expectation"}
        size="md"
        data-testid="coverage-expectation-drawer"
      >
        {adding && !selected ? (
          <DepartmentAdminActionForm action={createCoverageExpectationAction} className="space-y-3">
            <input type="hidden" name="departmentId" value={departmentId} />
            <TextInput name="name" label="Name" required maxLength={100} data-testid="coverage-name-input" />
            <TextArea name="description" label="Description" maxLength={500} rows={2} />
            <Button type="submit" size="compact">
              Create draft
            </Button>
          </DepartmentAdminActionForm>
        ) : selected ? (
          <ExpectationEditor
            departmentId={departmentId}
            expectation={selected}
            catalog={catalog}
            canManage={canManage}
          />
        ) : null}
      </Drawer>
    </div>
  );
}

function ExpectationEditor({
  departmentId,
  expectation,
  catalog,
  canManage,
}: {
  departmentId: string;
  expectation: CoverageExpectationView;
  catalog: CoverageCatalog;
  canManage: boolean;
}) {
  return (
    <div className="space-y-5" data-testid="coverage-expectation-editor">
      {canManage ? (
        <DepartmentAdminActionForm action={updateCoverageExpectationAction} className="space-y-3">
          <input type="hidden" name="departmentId" value={departmentId} />
          <input type="hidden" name="templateId" value={expectation.id} />
          <TextInput
            name="name"
            label="Name"
            required
            maxLength={100}
            defaultValue={expectation.name}
          />
          <TextArea
            name="description"
            label="Description"
            maxLength={500}
            rows={2}
            defaultValue={expectation.description ?? ""}
          />
          <Button type="submit" size="compact" variant="secondary">
            Save draft
          </Button>
        </DepartmentAdminActionForm>
      ) : (
        <p className="text-sm text-zinc-600">{expectation.description || "No description."}</p>
      )}

      <section className="space-y-2" data-testid="coverage-requirement-list">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Requirements
        </h3>
        {expectation.items.length === 0 ? (
          <p className="text-xs text-zinc-500">No requirements on this draft yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200">
            {expectation.items.map((item) => (
              <li key={item.id} className="space-y-2 px-3 py-2">
                <p className="text-sm font-medium text-zinc-900">
                  {item.roleLabel} × {item.requiredCount}
                </p>
                <p className="text-xs text-zinc-500">
                  {item.applicableOperationalTypeKeys.join(", ") || "No Operational Type"}
                  {" · "}
                  {item.applicableOperationalCycleStableKeys.join(", ") || "No cycle"}
                </p>
                {canManage ? (
                  <DepartmentAdminActionForm action={removeCoverageExpectationItemAction}>
                    <input type="hidden" name="departmentId" value={departmentId} />
                    <input type="hidden" name="templateId" value={expectation.id} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <button type="submit" className="text-xs font-medium text-zinc-700 underline">
                      Remove
                    </button>
                  </DepartmentAdminActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canManage ? (
        <RequirementForm
          departmentId={departmentId}
          templateId={expectation.id}
          catalog={catalog}
        />
      ) : null}

      {canManage && expectation.status === "DRAFT" ? (
        <DepartmentAdminActionForm
          action={publishCoverageExpectationAction}
          className="space-y-2 border-t border-zinc-200 pt-3"
        >
          <input type="hidden" name="departmentId" value={departmentId} />
          <input type="hidden" name="templateId" value={expectation.id} />
          <TextInput
            name="effectiveFrom"
            label="Effective from"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            data-testid="coverage-effective-from"
          />
          <Button type="submit" size="compact" data-testid="publish-coverage-expectation">
            Publish
          </Button>
        </DepartmentAdminActionForm>
      ) : (
        <p className="text-xs text-zinc-500">
          Published requirements apply on Run for their effective dates. Edit creates a new draft.
        </p>
      )}
    </div>
  );
}

function RequirementForm({
  departmentId,
  templateId,
  catalog,
}: {
  departmentId: string;
  templateId: string;
  catalog: CoverageCatalog;
}) {
  const [operationalTypeKeys, setOperationalTypeKeys] = useState<string[]>([]);
  const [cycleStableKeys, setCycleStableKeys] = useState<string[]>([]);

  return (
    <div data-testid="coverage-requirement-form">
    <DepartmentAdminActionForm
      action={upsertCoverageExpectationItemAction}
      className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3"
    >
      <input type="hidden" name="departmentId" value={departmentId} />
      <input type="hidden" name="templateId" value={templateId} />
      <Select name="roleKey" label="Responsibility" required data-testid="coverage-role-select">
        <option value="">Select a responsibility</option>
        {catalog.roles.map((role) => (
          <option key={role.key} value={role.key}>
            {role.label}
          </option>
        ))}
      </Select>
      <TextInput
        name="requiredCount"
        label="Required"
        type="number"
        min={1}
        max={50}
        defaultValue="1"
        required
      />
      <section className="space-y-1" data-testid="coverage-operational-types">
        <p className="text-xs font-medium text-zinc-700">Operational Types</p>
        {catalog.operationalTypes.length === 0 ? (
          <p className="text-xs text-zinc-500">No Operational Types are configured yet.</p>
        ) : (
          catalog.operationalTypes.map((type) => (
            <label key={type.key} className="flex items-center gap-2 text-sm text-zinc-800">
              <input
                type="checkbox"
                name="operationalTypeKeys"
                value={type.key}
                checked={operationalTypeKeys.includes(type.key)}
                onChange={() =>
                  setOperationalTypeKeys((current) =>
                    current.includes(type.key)
                      ? current.filter((key) => key !== type.key)
                      : [...current, type.key],
                  )
                }
              />
              {type.name}
            </label>
          ))
        )}
      </section>
      <section className="space-y-1" data-testid="coverage-cycles">
        <p className="text-xs font-medium text-zinc-700">Operational Cycles</p>
        {catalog.cycles.length === 0 ? (
          <p className="text-xs text-zinc-500">No Operational Cycles are configured yet.</p>
        ) : (
          catalog.cycles.map((cycle) => (
            <label key={cycle.stableKey} className="flex items-center gap-2 text-sm text-zinc-800">
              <input
                type="checkbox"
                name="cycleStableKeys"
                value={cycle.stableKey}
                checked={cycleStableKeys.includes(cycle.stableKey)}
                onChange={() =>
                  setCycleStableKeys((current) =>
                    current.includes(cycle.stableKey)
                      ? current.filter((key) => key !== cycle.stableKey)
                      : [...current, cycle.stableKey],
                  )
                }
              />
              {cycle.label}
            </label>
          ))
        )}
      </section>
      <Button type="submit" size="compact">
        Add requirement
      </Button>
    </DepartmentAdminActionForm>
    </div>
  );
}
