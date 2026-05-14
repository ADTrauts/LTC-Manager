"use client";

import {
  LogFieldType,
  LogRecurrence,
  LogSubmissionStatus,
  MealType,
  RoleKey,
} from "@prisma/client";
import Link from "next/link";
import { useState } from "react";

import {
  addTemplateFieldAction,
  createLogAssignmentAction,
  createLogTemplateAction,
  submitLogAction,
  toggleLogAssignmentAction,
} from "@/app/(protected)/logs/actions";
import { Drawer } from "@/components/drawer";

export type LogsTabId = "templates" | "assignments" | "submit" | "logs";

type FieldRow = {
  id: string;
  label: string;
  fieldType: LogFieldType;
  isRequired: boolean;
  unitLabel: string | null;
  fieldOptions: string[];
  fieldOrder: number;
};

type TemplateRow = {
  id: string;
  name: string;
  category: string;
  recurrence: LogRecurrence;
  isActive: boolean;
  description: string | null;
  instructions: string | null;
  fields: FieldRow[];
};

type UnitOption = { id: string; name: string };

type AssignmentRow = {
  id: string;
  recurrence: LogRecurrence;
  timesPerDay: number;
  mealType: MealType | null;
  requiredRole: RoleKey | null;
  isActive: boolean;
  unit: { id: string; name: string };
  template: { id: string; name: string };
};

type SubmissionRow = {
  id: string;
  submittedAt: string;
  status: LogSubmissionStatus;
  unit: { name: string };
  template: { name: string };
  templateCategory: string;
  submittedBy: { displayName: string | null } | null;
};

type MealServiceRow = {
  id: string;
  serviceDate: string;
  mealType: MealType;
  mealServiceReadyAt: string | null;
  mealServiceStartedAt: string | null;
  unit: { name: string };
  readyRecordedBy: { displayName: string | null } | null;
  startedRecordedBy: { displayName: string | null } | null;
};

type SelectedAssignment = {
  id: string;
  mealType: MealType | null;
  unit: { name: string };
  template: {
    id: string;
    name: string;
    category: string;
    fields: FieldRow[];
  };
} | null;

type LogsTabsClientProps = {
  activeTab: LogsTabId;
  templates: TemplateRow[];
  units: UnitOption[];
  assignments: AssignmentRow[];
  submissions: SubmissionRow[];
  mealServiceEvents: MealServiceRow[];
  activeLogSubtab: string;
  selectedAssignment: SelectedAssignment;
  tempChecklistByMeal: Record<MealType, string[]>;
  menuUnavailableReason: string | null;
};

function tabHref(tab: LogsTabId, assignmentId?: string, logTab?: string) {
  const p = new URLSearchParams();
  p.set("tab", tab);
  if (assignmentId) p.set("assignmentId", assignmentId);
  if (logTab) p.set("logTab", logTab);
  return `/logs?${p.toString()}`;
}

function normalizeTabKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function renderFieldInput(field: {
  id: string;
  label: string;
  fieldType: LogFieldType;
  isRequired: boolean;
  unitLabel: string | null;
  fieldOptions: string[];
}) {
  const inputName = `field_${field.id}`;
  const baseClass = "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm";
  const required = field.isRequired;

  if (field.fieldType === LogFieldType.LONG_TEXT) {
    return <textarea name={inputName} required={required} className={baseClass} rows={3} />;
  }

  if (field.fieldType === LogFieldType.NUMBER || field.fieldType === LogFieldType.TEMPERATURE) {
    return (
      <input
        type="number"
        step="0.01"
        name={inputName}
        required={required}
        className={baseClass}
        placeholder={field.unitLabel ?? undefined}
      />
    );
  }

  if (field.fieldType === LogFieldType.YES_NO || field.fieldType === LogFieldType.PASS_FAIL) {
    return (
      <select name={inputName} required={required} defaultValue="" className={baseClass}>
        <option value="" disabled>
          Select...
        </option>
        <option value="true">{field.fieldType === LogFieldType.PASS_FAIL ? "Pass" : "Yes"}</option>
        <option value="false">{field.fieldType === LogFieldType.PASS_FAIL ? "Fail" : "No"}</option>
      </select>
    );
  }

  if (field.fieldType === LogFieldType.DROPDOWN) {
    return (
      <select name={inputName} required={required} defaultValue="" className={baseClass}>
        <option value="" disabled>
          Select...
        </option>
        {field.fieldOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  return <input name={inputName} required={required} className={baseClass} />;
}

const TAB_LINKS: { id: LogsTabId; label: string }[] = [
  { id: "templates", label: "Templates" },
  { id: "assignments", label: "Assignments" },
  { id: "submit", label: "Submit" },
  { id: "logs", label: "Logs" },
];

export function LogsTabsClient({
  activeTab,
  templates,
  units,
  assignments,
  submissions,
  mealServiceEvents,
  activeLogSubtab,
  selectedAssignment,
  tempChecklistByMeal,
  menuUnavailableReason,
}: LogsTabsClientProps) {
  const [templateDrawerOpen, setTemplateDrawerOpen] = useState(false);
  const [assignmentDrawerOpen, setAssignmentDrawerOpen] = useState(false);
  const logCategories = Array.from(new Set(templates.map((template) => template.category))).sort((a, b) =>
    a.localeCompare(b),
  );
  const logTabs = [{ key: "service-log", label: "Service Log" }, ...logCategories.map((category) => ({ key: normalizeTabKey(category), label: category }))];
  const resolvedLogTab =
    logTabs.find((tab) => tab.key === activeLogSubtab)?.key ?? (logTabs.length > 0 ? logTabs[0].key : null);
  const selectedCategory = logTabs.find((tab) => tab.key === resolvedLogTab && tab.key !== "service-log")?.label ?? null;
  const selectedCategorySubmissions =
    selectedCategory === null ? [] : submissions.filter((row) => row.templateCategory === selectedCategory);
  const selectedMealForSubmit = selectedAssignment?.mealType ?? null;
  const isTempFocusedTemplate = Boolean(
    selectedAssignment &&
      (selectedAssignment.template.name.toLowerCase().includes("temp") ||
        selectedAssignment.template.category.toLowerCase().includes("temp")),
  );

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3" aria-label="Logs sections">
        {TAB_LINKS.map(({ id, label }) => {
          const isActive = activeTab === id;
          return (
            <Link
              key={id}
              href={tabHref(id)}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                isActive
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "border-2 border-zinc-300 bg-white font-semibold text-zinc-800 hover:bg-zinc-100"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {activeTab === "templates" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-900">Template library</h2>
            <button
              type="button"
              onClick={() => setTemplateDrawerOpen(true)}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Add template
            </button>
          </div>
          <div className="space-y-4">
            {templates.map((template) => (
              <article key={template.id} className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900">{template.name}</h3>
                    <p className="text-xs text-zinc-600">
                      {template.category} · {template.recurrence} · {template.isActive ? "Active" : "Inactive"}
                    </p>
                  </div>
                  <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                    {template.fields.length} fields
                  </span>
                </div>

                {template.fields.length > 0 ? (
                  <ul className="mb-3 space-y-1 text-xs text-zinc-600">
                    {template.fields.map((field) => (
                      <li key={field.id}>
                        {field.fieldOrder}. {field.label} ({field.fieldType})
                        {field.isRequired ? " *" : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mb-3 text-xs text-zinc-500">No fields yet.</p>
                )}

                <form action={addTemplateFieldAction} className="grid gap-2 md:grid-cols-5">
                  <input type="hidden" name="templateId" value={template.id} />
                  <input name="label" required placeholder="Field label" className="rounded-md border border-zinc-300 px-2 py-2 text-xs" />
                  <select name="fieldType" defaultValue={LogFieldType.SHORT_TEXT} className="rounded-md border border-zinc-300 px-2 py-2 text-xs">
                    {Object.values(LogFieldType).map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <input name="unitLabel" placeholder="Unit (C/F, qty)" className="rounded-md border border-zinc-300 px-2 py-2 text-xs" />
                  <input name="fieldOptions" placeholder="Dropdown options comma-separated" className="rounded-md border border-zinc-300 px-2 py-2 text-xs" />
                  <label className="flex items-center gap-2 text-xs text-zinc-700">
                    <input type="checkbox" name="isRequired" defaultChecked />
                    Required
                  </label>
                  <div className="md:col-span-5">
                    <button type="submit" className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-100">
                      Add field
                    </button>
                  </div>
                </form>
              </article>
            ))}
            {templates.length === 0 ? (
              <p className="text-sm text-zinc-500">No templates yet. Use Add template to create one.</p>
            ) : null}
          </div>

          <Drawer open={templateDrawerOpen} onClose={() => setTemplateDrawerOpen(false)} title="Add template">
            <form
              action={async (formData) => {
                await createLogTemplateAction(formData);
                setTemplateDrawerOpen(false);
              }}
              className="grid gap-3 md:grid-cols-2"
            >
              <input name="name" required placeholder="Template name" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <input name="category" required placeholder="Category (temp, cleaning, par...)" className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <select name="recurrence" defaultValue={LogRecurrence.DAILY} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
                {Object.values(LogRecurrence).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input type="checkbox" name="isActive" defaultChecked />
                Active
              </label>
              <input name="description" placeholder="Description (optional)" className="md:col-span-2 rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <input name="instructions" placeholder="Instructions (optional)" className="md:col-span-2 rounded-md border border-zinc-300 px-3 py-2 text-sm" />
              <div className="md:col-span-2">
                <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
                  Create template
                </button>
              </div>
            </form>
          </Drawer>
        </div>
      ) : null}

      {activeTab === "assignments" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-900">Assignment manager</h2>
            <button
              type="button"
              onClick={() => setAssignmentDrawerOpen(true)}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Add assignment
            </button>
          </div>

          <div className="space-y-2">
            {assignments.map((assignment) => (
              <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-200 bg-white p-2 text-sm shadow-sm">
                <div className="text-zinc-700">
                  {assignment.unit.name} · {assignment.template.name} · {assignment.recurrence}
                  {assignment.mealType ? ` · ${assignment.mealType}` : ""} · {assignment.isActive ? "Active" : "Inactive"}
                </div>
                <div className="flex gap-2">
                  <Link
                    href={tabHref("submit", assignment.id)}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100"
                  >
                    Submit
                  </Link>
                  <form action={toggleLogAssignmentAction}>
                    <input type="hidden" name="assignmentId" value={assignment.id} />
                    <input type="hidden" name="isActive" value={String(!assignment.isActive)} />
                    <button type="submit" className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100">
                      {assignment.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </div>
              </div>
            ))}
            {assignments.length === 0 ? (
              <p className="text-sm text-zinc-500">No assignments yet.</p>
            ) : null}
          </div>

          <Drawer open={assignmentDrawerOpen} onClose={() => setAssignmentDrawerOpen(false)} title="Add assignment">
            <form
              action={async (formData) => {
                await createLogAssignmentAction(formData);
                setAssignmentDrawerOpen(false);
              }}
              className="grid gap-3 md:grid-cols-2"
            >
              <select name="templateId" required className="md:col-span-2 rounded-md border border-zinc-300 px-3 py-2 text-sm">
                <option value="">Select template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
              <select name="unitId" required className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
                <option value="">Select unit</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
              <select name="recurrence" defaultValue={LogRecurrence.DAILY} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
                {Object.values(LogRecurrence).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <input
                type="number"
                name="timesPerDay"
                min={1}
                max={10}
                defaultValue={1}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <select name="mealType" defaultValue="" className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
                <option value="">No meal binding</option>
                {Object.values(MealType).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <select name="requiredRole" defaultValue="" className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
                <option value="">Any role</option>
                {Object.values(RoleKey).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-zinc-700 md:col-span-2">
                <input type="checkbox" name="isActive" defaultChecked />
                Active
              </label>
              <div className="md:col-span-2">
                <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
                  Assign template
                </button>
              </div>
            </form>
          </Drawer>
        </div>
      ) : null}

      {activeTab === "submit" ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Log submission</h2>
          {menuUnavailableReason ? (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {menuUnavailableReason}
            </div>
          ) : null}
          {selectedAssignment ? (
            <form action={submitLogAction} className="mt-3 space-y-3">
              <input type="hidden" name="assignmentId" value={selectedAssignment.id} />
              <p className="text-sm text-zinc-600">
                {selectedAssignment.unit.name} · {selectedAssignment.template.name}
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                <input type="date" name="serviceDate" required className="rounded-md border border-zinc-300 px-3 py-2 text-sm" />
                <select name="mealType" defaultValue={selectedAssignment.mealType ?? ""} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
                  <option value="">No meal</option>
                  {Object.values(MealType).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                <select name="status" defaultValue={LogSubmissionStatus.COMPLETED} className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
                  {Object.values(LogSubmissionStatus).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {selectedAssignment.template.fields.map((field) => (
                  <div key={field.id} className="space-y-1">
                    <label className="text-sm font-medium text-zinc-700">
                      {field.label}
                      {field.isRequired ? " *" : ""}
                    </label>
                    {renderFieldInput(field)}
                  </div>
                ))}
              </div>

              {isTempFocusedTemplate && selectedMealForSubmit ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
                  <p className="font-semibold text-amber-900">
                    Temp checklist for {selectedMealForSubmit.charAt(0) + selectedMealForSubmit.slice(1).toLowerCase()}
                  </p>
                  <p className="mt-1 text-amber-800">
                    {menuUnavailableReason ? (
                      "Menu-linked temp hints are unavailable until menu data loads (see note above)."
                    ) : (
                      <>
                        Pull temps from today&apos;s menu items for this meal:{" "}
                        {tempChecklistByMeal[selectedMealForSubmit].join(", ") || "No menu items set for this meal yet."}
                      </>
                    )}
                  </p>
                </div>
              ) : null}

              <textarea name="notes" placeholder="Notes (optional)" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" rows={3} />
              <textarea
                name="correctiveAction"
                placeholder="Corrective action (optional)"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                rows={2}
              />
              <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
                Submit log
              </button>
            </form>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">
              Pick an assignment from the{" "}
              <Link href={tabHref("assignments")} className="font-medium text-zinc-700 underline">
                Assignments
              </Link>{" "}
              tab and click Submit, or add an assignment first.
            </p>
          )}
        </div>
      ) : null}

      {activeTab === "logs" ? (
        <div className="space-y-4">
          <nav className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3" aria-label="Log subcategories">
            {logTabs.map((tab) => (
              <Link
                key={tab.key}
                href={tabHref("logs", undefined, tab.key)}
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  resolvedLogTab === tab.key
                    ? "bg-zinc-900 text-white shadow-sm"
                    : "border-2 border-zinc-300 bg-white font-semibold text-zinc-800 hover:bg-zinc-100"
                }`}
                aria-current={resolvedLogTab === tab.key ? "page" : undefined}
              >
                {tab.label}
              </Link>
            ))}
          </nav>

          {resolvedLogTab === "service-log" ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">Service Log</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Servery timing across units by meal: when service was ready and when distribution started.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-zinc-500">
                      <th className="py-2 pr-3">Service Date</th>
                      <th className="py-2 pr-3">Unit</th>
                      <th className="py-2 pr-3">Meal</th>
                      <th className="py-2 pr-3">Ready At</th>
                      <th className="py-2 pr-3">Ready By</th>
                      <th className="py-2 pr-3">Started At</th>
                      <th className="py-2 pr-3">Started By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mealServiceEvents.map((row) => (
                      <tr key={row.id} className="border-b border-zinc-100">
                        <td className="py-2 pr-3 text-zinc-700">{new Date(row.serviceDate).toLocaleDateString()}</td>
                        <td className="py-2 pr-3 text-zinc-700">{row.unit.name}</td>
                        <td className="py-2 pr-3 text-zinc-700">
                          {row.mealType.charAt(0) + row.mealType.slice(1).toLowerCase()}
                        </td>
                        <td className="py-2 pr-3 text-zinc-700">
                          {row.mealServiceReadyAt
                            ? new Date(row.mealServiceReadyAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
                            : "Not recorded"}
                        </td>
                        <td className="py-2 pr-3 text-zinc-700">{row.readyRecordedBy?.displayName ?? "-"}</td>
                        <td className="py-2 pr-3 text-zinc-700">
                          {row.mealServiceStartedAt
                            ? new Date(row.mealServiceStartedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
                            : "Not recorded"}
                        </td>
                        <td className="py-2 pr-3 text-zinc-700">{row.startedRecordedBy?.displayName ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {mealServiceEvents.length === 0 ? (
                  <p className="pt-3 text-sm text-zinc-500">No meal service records yet.</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {selectedCategory ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">{selectedCategory}</h2>
              <p className="mt-1 text-sm text-zinc-600">Recent submissions across units for this log category.</p>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-zinc-500">
                      <th className="py-2 pr-3">Submitted</th>
                      <th className="py-2 pr-3">Unit</th>
                      <th className="py-2 pr-3">Template</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCategorySubmissions.map((row) => (
                      <tr key={row.id} className="border-b border-zinc-100">
                        <td className="py-2 pr-3 text-zinc-700">{new Date(row.submittedAt).toLocaleString()}</td>
                        <td className="py-2 pr-3 text-zinc-700">{row.unit.name}</td>
                        <td className="py-2 pr-3 text-zinc-700">{row.template.name}</td>
                        <td className="py-2 pr-3 text-zinc-700">{row.status}</td>
                        <td className="py-2 pr-3 text-zinc-700">{row.submittedBy?.displayName ?? "Unknown"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {selectedCategorySubmissions.length === 0 ? (
                  <p className="pt-3 text-sm text-zinc-500">No submissions in this category yet.</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
