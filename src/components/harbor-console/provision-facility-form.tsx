"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  previewHarborProvisionAdministratorAction,
  provisionFacilityAction,
  type HarborProvisionState,
} from "@/app/console/(staff)/customers/provision-actions";
import {
  ORGANIZATION_TYPE_OPTIONS,
  organizationTypeLabel,
  type OrganizationTypeValue,
} from "@/lib/organization";
import { DEFAULT_FACILITY_TIMEZONE, FACILITY_TIMEZONE_OPTIONS } from "@/lib/facility-provisioning";

export type HarborOrganizationOption = {
  id: string;
  name: string;
  legalName: string | null;
  displayName: string | null;
  organizationType: OrganizationTypeValue | null;
  facilityCount: number;
};

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--run-aside)] px-4 text-sm font-semibold text-[var(--run-aside-fg)] disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export function ProvisionFacilityForm({ organizations }: { organizations: HarborOrganizationOption[] }) {
  const [step, setStep] = useState(1);
  const [organizationMode, setOrganizationMode] = useState<"create" | "existing">("create");
  const [organizationId, setOrganizationId] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationType, setOrganizationType] = useState<OrganizationTypeValue>("OTHER");
  const [facilityDisplayName, setFacilityDisplayName] = useState("");
  const [timezone, setTimezone] = useState(DEFAULT_FACILITY_TIMEZONE);
  const [billingEmail, setBillingEmail] = useState("");
  const [administratorName, setAdministratorName] = useState("");
  const [administratorEmail, setAdministratorEmail] = useState("");
  const [existingUser, setExistingUser] = useState<{ displayName: string; email: string } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [confirmOwnership, setConfirmOwnership] = useState(false);
  const [confirmExistingUser, setConfirmExistingUser] = useState(false);
  const [confirmDuplicateName, setConfirmDuplicateName] = useState(false);
  const [state, action] = useActionState<HarborProvisionState, FormData>(provisionFacilityAction, null);

  const selectedOrganization = organizations.find((row) => row.id === organizationId) ?? null;
  const organizationLabel =
    organizationMode === "existing"
      ? selectedOrganization
        ? selectedOrganization.displayName?.trim() || selectedOrganization.name
        : "—"
      : organizationName || "—";

  async function goToConfirmation() {
    setLookupError(null);
    const preview = await previewHarborProvisionAdministratorAction(administratorEmail);
    if ("error" in preview) {
      setLookupError(preview.error);
      return;
    }
    setExistingUser(preview.exists ? { displayName: preview.displayName, email: preview.email } : null);
    setConfirmExistingUser(false);
    setStep(4);
  }

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2 text-xs font-medium text-[var(--text-secondary)]">
        {["Organization", "Facility", "Administrator", "Confirm"].map((label, index) => (
          <li
            key={label}
            className={step === index + 1 ? "text-[var(--text-primary)]" : undefined}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <section className="space-y-4 rounded-md border border-[var(--border)] bg-white p-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Parent Organization</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="organizationModeChoice"
                checked={organizationMode === "create"}
                onChange={() => setOrganizationMode("create")}
              />
              Create new
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="organizationModeChoice"
                checked={organizationMode === "existing"}
                onChange={() => setOrganizationMode("existing")}
              />
              Use existing
            </label>
          </fieldset>
          {organizationMode === "create" ? (
            <div className="grid gap-3">
              <label className="text-sm">
                Organization name
                <input
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--border-strong)] px-3 py-2"
                />
              </label>
              <label className="text-sm">
                Organization type
                <select
                  value={organizationType}
                  onChange={(event) => setOrganizationType(event.target.value as OrganizationTypeValue)}
                  className="mt-1 w-full rounded-md border border-[var(--border-strong)] px-3 py-2"
                >
                  {ORGANIZATION_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <label className="text-sm">
              Organization
              <select
                value={organizationId}
                onChange={(event) => setOrganizationId(event.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--border-strong)] px-3 py-2"
              >
                <option value="">Select by ID</option>
                {organizations.map((row) => (
                  <option key={row.id} value={row.id}>
                    {(row.displayName?.trim() || row.name)
                      + (row.legalName ? ` · ${row.legalName}` : "")
                      + ` · ${organizationTypeLabel(row.organizationType)}`
                      + ` · ${row.facilityCount} facilities`
                      + ` · ${row.id}`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={organizationMode === "create" ? organizationName.trim().length < 2 : !organizationId}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--border-strong)] bg-white px-4 text-sm font-semibold disabled:opacity-60"
          >
            Continue
          </button>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-4 rounded-md border border-[var(--border)] bg-white p-4">
          <label className="block text-sm">
            Facility name
            <input
              value={facilityDisplayName}
              onChange={(event) => setFacilityDisplayName(event.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border-strong)] px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Timezone
            <select
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border-strong)] px-3 py-2"
            >
              {FACILITY_TIMEZONE_OPTIONS.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Billing email
            <input
              type="email"
              value={billingEmail}
              onChange={(event) => setBillingEmail(event.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border-strong)] px-3 py-2"
            />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep(1)} className="text-sm underline">
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={facilityDisplayName.trim().length < 2 || !billingEmail.includes("@")}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--border-strong)] bg-white px-4 text-sm font-semibold disabled:opacity-60"
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="space-y-4 rounded-md border border-[var(--border)] bg-white p-4">
          <label className="block text-sm">
            Administrator name
            <input
              value={administratorName}
              onChange={(event) => setAdministratorName(event.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border-strong)] px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Administrator email
            <input
              type="email"
              value={administratorEmail}
              onChange={(event) => setAdministratorEmail(event.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border-strong)] px-3 py-2"
            />
          </label>
          {lookupError ? <p className="text-sm text-red-700">{lookupError}</p> : null}
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep(2)} className="text-sm underline">
              Back
            </button>
            <button
              type="button"
              onClick={() => void goToConfirmation()}
              disabled={administratorName.trim().length < 2 || !administratorEmail.includes("@")}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--border-strong)] bg-white px-4 text-sm font-semibold disabled:opacity-60"
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <form action={action} className="space-y-4 rounded-md border border-[var(--border)] bg-white p-4">
          <input type="hidden" name="organizationMode" value={organizationMode} />
          <input type="hidden" name="organizationId" value={organizationId} />
          <input type="hidden" name="organizationName" value={organizationName} />
          <input type="hidden" name="organizationType" value={organizationType} />
          <input type="hidden" name="facilityDisplayName" value={facilityDisplayName} />
          <input type="hidden" name="timezone" value={timezone} />
          <input type="hidden" name="billingEmail" value={billingEmail} />
          <input type="hidden" name="administratorName" value={administratorName} />
          <input type="hidden" name="administratorEmail" value={administratorEmail} />
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-[var(--text-secondary)]">Organization</dt>
              <dd>{organizationLabel}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)]">Facility</dt>
              <dd>{facilityDisplayName}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)]">Timezone</dt>
              <dd>{timezone}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)]">Billing email</dt>
              <dd>{billingEmail}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-[var(--text-secondary)]">Initial Facility Administrator</dt>
              <dd>
                {existingUser
                  ? `${existingUser.displayName} (${existingUser.email}) — existing Vssyl user`
                  : `${administratorName} (${administratorEmail}) — new Vssyl user, invite will be sent`}
              </dd>
            </div>
          </dl>
          <p className="text-sm">
            This Facility will be owned by {organizationLabel}. Ownership cannot currently be reassigned.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmOwnership}
              onChange={(event) => setConfirmOwnership(event.target.checked)}
            />
            I understand parent Organization ownership cannot be reassigned.
          </label>
          {existingUser ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmExistingUser}
                onChange={(event) => setConfirmExistingUser(event.target.checked)}
              />
              This existing Vssyl user will receive Facility Administrator access.
            </label>
          ) : null}
          {state?.code === "DUPLICATE_NAME" ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmDuplicateName}
                onChange={(event) => setConfirmDuplicateName(event.target.checked)}
              />
              A Facility with this name already exists under this Organization. Create another anyway.
            </label>
          ) : null}
          {confirmOwnership ? <input type="hidden" name="confirmOwnership" value="1" /> : null}
          {confirmExistingUser ? <input type="hidden" name="confirmExistingUser" value="1" /> : null}
          {confirmDuplicateName ? <input type="hidden" name="confirmDuplicateName" value="1" /> : null}
          {state && !state.ok ? <p className="text-sm text-red-700">{state.message}</p> : null}
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep(3)} className="text-sm underline">
              Back
            </button>
            <SubmitButton label="Provision Facility" pendingLabel="Provisioning…" />
          </div>
        </form>
      ) : null}
    </div>
  );
}
