"use client";

import type { UnitType } from "@prisma/client";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  startBillingCheckoutAction,
  type BillingActionState,
} from "@/app/(protected)/admin/billing/actions";
import {
  groupCatalogByIndustry,
  type FacilityDepartmentCatalogItem,
} from "@/lib/department-products/facility-catalog";

type Step = "facility" | "managers" | "departments" | "billing" | "locations";

type OnboardingStateResponse = {
  facility: {
    displayName: string;
    managementCompanyName: string | null;
    billingEmail: string | null;
    onboardingCurrentStep: string;
  };
  managerInvites: Array<{ id: string; email: string }>;
  catalog?: FacilityDepartmentCatalogItem[];
  billingStatus?: string;
  stripeBillingReady?: boolean;
};

const stepOrder: Step[] = ["facility", "managers", "departments", "billing", "locations"];
const SELECTED_KEYS_STORAGE = "vssyl.setup.departmentProductKeys";
const checkoutInitialState: BillingActionState = { error: null };

function toStep(raw: string): Step {
  if ((stepOrder as string[]).includes(raw)) {
    return raw as Step;
  }
  return "facility";
}

const unitTypes: UnitType[] = [
  "SERVERY",
  "KITCHEN",
  "RETAIL",
  "OFFICE",
  "STORAGE",
  "RESIDENT_AREA",
  "COMMON_AREA",
  "MECHANICAL",
  "RESTROOM_CLUSTER",
  "EVS_ZONE",
  "GROUND",
  "OTHER",
];

function readStoredDepartmentKeys(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(SELECTED_KEYS_STORAGE);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string") : [];
  } catch {
    return [];
  }
}

function writeStoredDepartmentKeys(keys: string[]) {
  window.sessionStorage.setItem(SELECTED_KEYS_STORAGE, JSON.stringify(keys));
}

export function SetupWizard({ checkout }: { checkout?: string | null }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<OnboardingStateResponse | null>(null);
  const [step, setStep] = useState<Step>("facility");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [managerInput, setManagerInput] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [locationType, setLocationType] = useState<UnitType>("OTHER");
  const [locationItems, setLocationItems] = useState<
    Array<{ name: string; unitType: UnitType; parentName: string | null }>
  >([]);
  const [locationParentName, setLocationParentName] = useState<string>("");
  const [stripeBillingReady, setStripeBillingReady] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [interval, setInterval] = useState<"MONTHLY" | "ANNUAL">("ANNUAL");
  const [checkoutState, checkoutAction] = useActionState(startBillingCheckoutAction, checkoutInitialState);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/onboarding/state");
      const payload = (await res.json()) as OnboardingStateResponse;
      setState(payload);
      setStripeBillingReady(payload.stripeBillingReady !== false);
      setStep(toStep(payload.facility.onboardingCurrentStep));
      const stored = readStoredDepartmentKeys();
      const licensed = (payload.catalog ?? []).filter((item) => item.licensed).map((item) => item.productKey);
      setSelectedKeys(stored.length > 0 ? stored : licensed);
      setLoaded(true);
    })();
  }, []);

  async function patchState(data: Record<string, unknown>) {
    const res = await fetch("/api/onboarding/state", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "Could not save setup step.");
    }
    return res.json();
  }

  async function saveFacility(formData: FormData) {
    setBusy(true);
    setError(null);
    try {
      await patchState({
        facilityName: String(formData.get("facilityName") ?? ""),
        managementCompanyName: String(formData.get("managementCompanyName") ?? ""),
        billingEmail: String(formData.get("billingEmail") ?? ""),
        step: "managers",
      });
      setStep("managers");
      setState((prev) =>
        prev
          ? {
              ...prev,
              facility: {
                ...prev.facility,
                displayName: String(formData.get("facilityName") ?? prev.facility.displayName),
                managementCompanyName: String(formData.get("managementCompanyName") ?? "") || null,
                billingEmail: String(formData.get("billingEmail") ?? "") || null,
                onboardingCurrentStep: "managers",
              },
            }
          : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save facility settings.");
    } finally {
      setBusy(false);
    }
  }

  async function saveManagers(skip = false) {
    setBusy(true);
    setError(null);
    try {
      const emails = skip
        ? []
        : managerInput
            .split(/[,\n;]/)
            .map((x) => x.trim())
            .filter(Boolean);
      await fetch("/api/onboarding/managers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emails }),
      });
      await patchState({ step: "departments" });
      setStep("departments");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save manager emails.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDepartments() {
    setBusy(true);
    setError(null);
    try {
      if (stripeBillingReady && selectedKeys.length === 0) {
        throw new Error("Select at least one department.");
      }
      writeStoredDepartmentKeys(selectedKeys);
      await patchState({ step: "billing" });
      setStep("billing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save department selection.");
    } finally {
      setBusy(false);
    }
  }

  async function saveLocations(skip = false) {
    setBusy(true);
    setError(null);
    try {
      const locations = skip
        ? []
        : locationItems.map(({ name, unitType, parentName }) => ({
            name,
            unitType,
            ...(parentName ? { parentName } : {}),
          }));
      const res = await fetch("/api/onboarding/locations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locations }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Could not save locations.");
      }
      window.sessionStorage.removeItem(SELECTED_KEYS_STORAGE);
      router.push("/dashboard?onboarding=complete");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save locations.");
    } finally {
      setBusy(false);
    }
  }

  async function finishWithoutLicense() {
    setBusy(true);
    setError(null);
    try {
      await patchState({ step: "locations" });
      setStep("locations");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not continue setup.");
    } finally {
      setBusy(false);
    }
  }

  function toggleDepartment(key: string) {
    setSelectedKeys((current) => {
      const next = current.includes(key) ? current.filter((value) => value !== key) : [...current, key];
      writeStoredDepartmentKeys(next);
      return next;
    });
  }

  if (!loaded || !state) {
    return <div className="mx-auto max-w-4xl rounded-xl border border-zinc-200 bg-white p-6">Loading setup...</div>;
  }

  const catalog = state.catalog ?? [];
  const groups = groupCatalogByIndustry(catalog);
  const currentIdx = stepOrder.indexOf(step);

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Guided setup</h1>
            <p className="text-sm text-zinc-600">
              Finish these steps once, and your team can start using Vssyl right away.
            </p>
          </div>
          <form action="/api/auth/logout" method="post" className="shrink-0">
            <button
              type="submit"
              className="app-button rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
            >
              Sign out
            </button>
          </form>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {stepOrder.map((item, idx) => (
            <div
              key={item}
              className={`rounded px-2 py-1 text-center text-xs font-medium uppercase tracking-wide ${
                idx <= currentIdx ? "bg-zinc-900 text-white" : "bg-zinc-200 text-zinc-600"
              }`}
            >
              {item}
            </div>
          ))}
        </div>
      </header>

      <article className="app-card space-y-4">
        {step === "facility" ? (
          <form action={saveFacility} className="space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900">Facility setup</h2>
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-zinc-700">Facility Name</span>
              <input name="facilityName" defaultValue={state.facility.displayName} className="app-input w-full" required />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-zinc-700">Managing Partner (optional)</span>
              <input
                name="managementCompanyName"
                defaultValue={state.facility.managementCompanyName ?? ""}
                className="app-input w-full"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-zinc-700">Billing Email</span>
              <input
                name="billingEmail"
                type="email"
                defaultValue={state.facility.billingEmail ?? ""}
                className="app-input w-full"
                required
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="app-button app-accent-button w-full font-semibold text-white disabled:opacity-70"
            >
              {busy ? "Saving..." : "Continue to managers"}
            </button>
          </form>
        ) : null}

        {step === "managers" ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900">Additional managers (optional)</h2>
            <p className="text-sm text-zinc-600">Add manager emails separated by commas, semicolons, or new lines.</p>
            <textarea
              value={managerInput}
              onChange={(e) => setManagerInput(e.target.value)}
              className="app-input min-h-28 w-full"
              placeholder="manager1@example.com, manager2@example.com"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void saveManagers(false)}
                disabled={busy}
                className="app-button app-accent-button flex-1 font-semibold text-white disabled:opacity-70"
              >
                {busy ? "Saving..." : "Save and continue"}
              </button>
              <button
                type="button"
                onClick={() => void saveManagers(true)}
                disabled={busy}
                className="app-button flex-1 border border-zinc-300 bg-white font-semibold text-zinc-900"
              >
                Skip this step
              </button>
            </div>
          </div>
        ) : null}

        {step === "departments" ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900">Choose your departments</h2>
            <p className="text-sm text-zinc-600">
              Select the departments your facility will operate with Vssyl.
            </p>
            {groups.map((group) => (
              <section key={group.industry} className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">{group.label}</h3>
                <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200">
                  {group.products.map((product) => {
                    const checked = selectedKeys.includes(product.productKey);
                    return (
                      <li key={product.productKey}>
                        <label className="flex cursor-pointer items-start gap-3 px-3 py-3 text-sm hover:bg-zinc-50">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleDepartment(product.productKey)}
                            className="mt-0.5 h-4 w-4 rounded border-zinc-300"
                          />
                          <span>
                            <span className="font-medium text-zinc-900">{product.name}</span>
                            <span className="mt-0.5 block text-xs text-zinc-500">{product.productKey}</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            <button
              type="button"
              onClick={() => void saveDepartments()}
              disabled={busy}
              className="app-button app-accent-button w-full font-semibold text-white disabled:opacity-70"
            >
              {busy ? "Saving..." : "Continue to billing"}
            </button>
          </div>
        ) : null}

        {step === "billing" ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900">License departments</h2>
            <p className="text-sm text-zinc-600">
              Payment licenses the departments you selected. They are installed only after checkout
              succeeds.
            </p>
            {checkout === "canceled" ? (
              <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                Checkout was canceled. No department was licensed or installed.
              </p>
            ) : null}
            {selectedKeys.length > 0 ? (
              <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 text-sm">
                {catalog
                  .filter((item) => selectedKeys.includes(item.productKey))
                  .map((item) => (
                    <li key={item.productKey} className="px-3 py-2 font-medium text-zinc-900">
                      {item.name}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-600">No departments selected yet.</p>
            )}

            {!stripeBillingReady ? (
              <div className="space-y-3 rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-900">
                <p>
                  Stripe is not fully configured. You can finish facility setup now. Selected
                  departments will not be installed until they are licensed later.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void finishWithoutLicense()}
                  className="app-button app-accent-button w-full font-semibold text-white disabled:opacity-70"
                >
                  {busy ? "Continuing..." : "Continue without licensing"}
                </button>
              </div>
            ) : (
              <form action={checkoutAction} className="space-y-3">
                {selectedKeys.map((key) => (
                  <input key={key} type="hidden" name="departmentKey" value={key} />
                ))}
                <input type="hidden" name="setupPath" value="SELF_SERVE" />
                <input type="hidden" name="returnTo" value="setup" />
                <fieldset className="grid gap-3 sm:grid-cols-2">
                  <legend className="sr-only">Billing interval</legend>
                  <label className="flex cursor-pointer flex-col rounded-md border border-zinc-200 px-3 py-3 text-sm">
                    <span className="flex items-center gap-2 font-medium text-zinc-900">
                      <input
                        type="radio"
                        name="interval"
                        value="MONTHLY"
                        checked={interval === "MONTHLY"}
                        onChange={() => setInterval("MONTHLY")}
                        className="h-4 w-4"
                      />
                      Monthly
                    </span>
                  </label>
                  <label className="flex cursor-pointer flex-col rounded-md border border-zinc-200 px-3 py-3 text-sm">
                    <span className="flex items-center gap-2 font-medium text-zinc-900">
                      <input
                        type="radio"
                        name="interval"
                        value="ANNUAL"
                        checked={interval === "ANNUAL"}
                        onChange={() => setInterval("ANNUAL")}
                        className="h-4 w-4"
                      />
                      Annual
                    </span>
                  </label>
                </fieldset>
                {checkoutState.error ? (
                  <p className="text-sm text-rose-700" role="alert">
                    {checkoutState.error}
                  </p>
                ) : null}
                <CheckoutSubmit disabled={selectedKeys.length === 0} />
              </form>
            )}
          </div>
        ) : null}

        {step === "locations" ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900">Initial locations (optional)</h2>
            <p className="text-sm text-zinc-600">
              Add locations now, or skip and do it later from the Units page. Responsibility is
              assigned only to departments already installed at this facility.
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              <label className="block space-y-1 text-sm md:col-span-2">
                <span className="font-medium text-zinc-700">Name</span>
                <input
                  value={locationInput}
                  onChange={(e) => setLocationInput(e.target.value)}
                  className="app-input w-full"
                  placeholder="Example: Main Kitchen"
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="font-medium text-zinc-700">Type</span>
                <select
                  value={locationType}
                  onChange={(e) => setLocationType(e.target.value as UnitType)}
                  className="app-input w-full"
                >
                  {unitTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                <span className="font-medium text-zinc-700">Parent (optional)</span>
                <select
                  value={locationParentName}
                  onChange={(e) => setLocationParentName(e.target.value)}
                  className="app-input w-full"
                  disabled={locationItems.length === 0}
                >
                  <option value="">Top level</option>
                  {locationItems.map((loc, idx) => (
                    <option key={`${loc.name}-${idx}`} value={loc.name}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end md:col-span-2">
                <button
                  type="button"
                  className="app-button border border-zinc-300 bg-white font-semibold text-zinc-900"
                  onClick={() => {
                    const trimmed = locationInput.trim();
                    if (!trimmed) return;
                    if (locationItems.some((row) => row.name.toLowerCase() === trimmed.toLowerCase())) {
                      setError("That location name is already in the list.");
                      return;
                    }
                    const parent = locationParentName.trim() || null;
                    if (parent && !locationItems.some((row) => row.name === parent)) {
                      setError("Pick a parent from the list, or leave parent as top level.");
                      return;
                    }
                    setLocationItems((prev) => [
                      ...prev,
                      { name: trimmed, unitType: locationType, parentName: parent },
                    ]);
                    setLocationInput("");
                    setLocationParentName("");
                    setError(null);
                  }}
                >
                  Add
                </button>
              </div>
            </div>
            <ul className="space-y-2">
              {locationItems.map((item, index) => (
                <li key={`${item.name}-${index}`} className="flex items-center justify-between rounded border border-zinc-200 p-2 text-sm">
                  <span>
                    {item.name}{" "}
                    <span className="text-zinc-500">
                      ({item.unitType}
                      {item.parentName ? ` · under ${item.parentName}` : ""})
                    </span>
                  </span>
                  <button
                    type="button"
                    className="text-xs font-medium text-red-700"
                    onClick={() =>
                      setLocationItems((prev) => {
                        const removed = prev[index];
                        return prev
                          .filter((_, idx) => idx !== index)
                          .map((row) =>
                            row.parentName === removed.name ? { ...row, parentName: null } : row,
                          );
                      })
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void saveLocations(false)}
                disabled={busy}
                className="app-button app-accent-button flex-1 font-semibold text-white disabled:opacity-70"
              >
                {busy ? "Saving..." : "Save and finish"}
              </button>
              <button
                type="button"
                onClick={() => void saveLocations(true)}
                disabled={busy}
                className="app-button flex-1 border border-zinc-300 bg-white font-semibold text-zinc-900"
              >
                Skip this step
              </button>
            </div>
          </div>
        ) : null}

        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      </article>
    </section>
  );
}

function CheckoutSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="app-button app-accent-button w-full font-semibold text-white disabled:opacity-70"
    >
      {pending ? "Opening checkout..." : "Continue to checkout"}
    </button>
  );
}
