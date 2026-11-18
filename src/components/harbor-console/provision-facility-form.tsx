"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  previewHarborProvisionAdministratorAction,
  provisionFacilityAction,
  recoverHarborProvisionAction,
  type HarborProvisionState,
} from "@/app/console/(staff)/customers/provision-actions";
import {
  ORGANIZATION_TYPE_OPTIONS,
  organizationTypeLabel,
  type OrganizationTypeValue,
} from "@/lib/organization/types";
import { DEFAULT_FACILITY_TIMEZONE, FACILITY_TIMEZONE_OPTIONS } from "@/lib/facility-provisioning/timezones";

export type HarborOrganizationOption = {
  id: string;
  name: string;
  legalName: string | null;
  displayName: string | null;
  organizationType: OrganizationTypeValue | null;
  facilityCount: number;
};

const PENDING_PROVISION_REQUEST = "harbor:pending-facility-provision";

function storedRequestKey() {
  try { return sessionStorage.getItem(PENDING_PROVISION_REQUEST); } catch { return null; }
}

function storeRequestKey(key: string | null) {
  try {
    if (key) sessionStorage.setItem(PENDING_PROVISION_REQUEST, key);
    else sessionStorage.removeItem(PENDING_PROVISION_REQUEST);
  } catch {
    // The in-memory key still supports retries in this tab while the form is open.
  }
}

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
  const router = useRouter();
  const requestKey = useRef<string | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [recovering, startRecovery] = useTransition();
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
  const [existingUser, setExistingUser] = useState<{ id: string; displayName: string; email: string } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [confirmOwnership, setConfirmOwnership] = useState(false);
  const [confirmExistingUser, setConfirmExistingUser] = useState(false);
  const [confirmDuplicateName, setConfirmDuplicateName] = useState(false);

  function openProvisionedFacility(key: string, path: string) {
    if (storedRequestKey() === key) storeRequestKey(null);
    if (requestKey.current === key) requestKey.current = null;
    router.replace(path);
  }

  const [state, action, submitting] = useActionState<HarborProvisionState, FormData>(async (previous, formData) => {
    const key = requestKey.current ?? storedRequestKey() ?? crypto.randomUUID();
    requestKey.current = key;
    storeRequestKey(key);
    formData.set("requestKey", key);
    let result: HarborProvisionState;
    try {
      result = await provisionFacilityAction(previous, formData);
    } catch {
      return { ok: false, message: "The result could not be confirmed. Recover or retry this submission before starting a new one." };
    }
    if (result?.ok && result.nextPath) openProvisionedFacility(key, result.nextPath);
    return result;
  }, null);

  function recoverSubmission() {
    const key = requestKey.current ?? storedRequestKey();
    if (!key) {
      setRecoveryMessage("There is no pending submission in this tab.");
      return;
    }
    startRecovery(async () => {
      try {
        const result = await recoverHarborProvisionAction(key);
        if (result?.ok && result.nextPath) openProvisionedFacility(key, result.nextPath);
        else setRecoveryMessage(result?.message ?? "Unable to recover this submission.");
      } catch {
        setRecoveryMessage("Unable to recover this submission. Try again.");
      }
    });
  }

  const selectedMatch = state?.organizationConflict?.matches.find((row) => row.id === organizationId && row.isActive);
  const selectedOrganization = organizations.find((row) => row.id === organizationId) ?? selectedMatch;
  const conflict = organizationMode === "create" && state?.organizationConflict?.proposedName === organizationName.trim()
    ? state.organizationConflict
    : null;
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
    setExistingUser(preview.userId ? { id: preview.userId, displayName: preview.displayName, email: preview.email } : null);
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
      <div className="space-y-2 text-sm">
        <button type="button" disabled={recovering || submitting} onClick={recoverSubmission} className="underline">
          {recovering ? "Checking previous submission…" : "Recover previous submission"}
        </button>
        {recoveryMessage ? <p role="status">{recoveryMessage}</p> : null}
        {state?.code === "PROVISION_REQUEST_CONFLICT" ? (
          <button
            type="button"
            onClick={() => {
              requestKey.current = null;
              storeRequestKey(null);
              setRecoveryMessage("Review the details before submitting a separate provisioning request.");
              setConfirmOwnership(false);
            }}
            disabled={recovering || submitting}
            className="ml-3 underline"
          >
            Start a separate request
          </button>
        ) : null}
      </div>

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
                  maxLength={200}
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
                {selectedMatch && !organizations.some((row) => row.id === selectedMatch.id) ? (
                  <option value={selectedMatch.id}>{selectedMatch.displayName || selectedMatch.name} · {selectedMatch.id}</option>
                ) : null}
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
          {conflict ? (
            <fieldset className="space-y-3 rounded-md border border-[var(--border-strong)] p-3 text-sm">
              <legend className="px-1 font-semibold">Matching Organizations</legend>
              <p role="status">{state?.message}</p>
              <ul className="space-y-2">
                {conflict.matches.map((match) => (
                  <li key={match.id} className="rounded border border-[var(--border)] p-2">
                    <p className="font-semibold">{match.displayName?.trim() || match.name}</p>
                    <p className="text-[var(--text-secondary)]">
                      {match.name}{match.legalName ? ` · ${match.legalName}` : ""} · {match.isActive ? "Active" : "Inactive"}
                    </p>
                    <p className="break-all text-xs">ID: {match.id}</p>
                    {match.isActive ? (
                      <button
                        type="button"
                        onClick={() => {
                          setOrganizationId(match.id);
                          setOrganizationMode("existing");
                          setConfirmOwnership(false);
                          setConfirmDuplicateName(false);
                        }}
                        className="mt-1 font-semibold underline"
                      >
                        Use this Organization
                      </button>
                    ) : null}
                    <input type="hidden" name="reviewedOrganizationMatchId" value={match.id} />
                  </li>
                ))}
              </ul>
              <label className="block">
                Verification basis or reference
                <input
                  name="organizationVerificationBasis"
                  minLength={8}
                  maxLength={240}
                  aria-describedby="organization-verification-help"
                  className="mt-1 w-full rounded-md border border-[var(--border-strong)] px-3 py-2"
                />
              </label>
              <p id="organization-verification-help" className="text-xs text-[var(--text-secondary)]">
                Enter 8–240 characters describing what you verified, such as a registry reference. Do not enter private documents, links, or secrets.
              </p>
              <label className="flex items-start gap-2">
                <input type="checkbox" name="attestDistinctOrganization" value="1" />
                I verified that this is a distinct Organization and want to create it.
              </label>
            </fieldset>
          ) : null}
          {confirmOwnership ? <input type="hidden" name="confirmOwnership" value="1" /> : null}
          {confirmExistingUser && existingUser ? <input type="hidden" name="confirmedAdministratorId" value={existingUser.id} /> : null}
          {confirmDuplicateName ? <input type="hidden" name="confirmDuplicateName" value="1" /> : null}
          {state && !state.ok && !state.organizationConflict ? <p className="text-sm text-red-700">{state.message}</p> : null}
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
