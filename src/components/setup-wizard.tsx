"use client";

import type { UnitType } from "@prisma/client";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Step = "facility" | "managers" | "locations" | "billing";

type OnboardingStateResponse = {
  facility: {
    displayName: string;
    managementCompanyName: string | null;
    billingEmail: string | null;
    onboardingCurrentStep: string;
  };
  managerInvites: Array<{ id: string; email: string }>;
  stripeBillingReady?: boolean;
};

const stepOrder: Step[] = ["facility", "managers", "locations", "billing"];

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

function BillingCardForm({
  onSuccess,
}: {
  onSuccess: (paymentMethodId: string) => Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitBilling() {
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);

    const result = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/setup`,
      },
      redirect: "if_required",
    });

    if (result.error) {
      setBusy(false);
      setError(result.error.message ?? "Could not save card.");
      return;
    }

    const paymentMethodId =
      typeof result.setupIntent?.payment_method === "string" ? result.setupIntent.payment_method : null;
    if (!paymentMethodId) {
      setBusy(false);
      setError("Payment method was not returned.");
      return;
    }

    await onSuccess(paymentMethodId);
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <PaymentElement />
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <button
        type="button"
        onClick={submitBilling}
        disabled={busy || !stripe || !elements}
        className="app-button app-accent-button w-full font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
      >
        {busy ? "Saving card..." : "Save card and finish setup"}
      </button>
      <p className="text-xs text-zinc-500">Your card is securely handled by Stripe. We do not store raw card data.</p>
    </div>
  );
}

export function SetupWizard() {
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
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripeBillingReady, setStripeBillingReady] = useState(true);

  const stripePromise = useMemo(() => {
    const publishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    return publishable ? loadStripe(publishable) : null;
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/onboarding/state");
      const payload = (await res.json()) as OnboardingStateResponse;
      setState(payload);
      setStripeBillingReady(payload.stripeBillingReady !== false);
      setStep(toStep(payload.facility.onboardingCurrentStep));
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
      await patchState({ step: "locations" });
      setStep("locations");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save manager emails.");
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
      await patchState({ step: "billing" });
      setStep("billing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save locations.");
    } finally {
      setBusy(false);
    }
  }

  async function beginBilling() {
    setError(null);
    const res = await fetch("/api/billing/setup-intent", { method: "POST" });
    const payload = (await res.json().catch(() => ({}))) as { clientSecret?: string; error?: string };
    if (!res.ok || !payload.clientSecret) {
      setError(payload.error ?? "Unable to initialize billing step.");
      return;
    }
    setClientSecret(payload.clientSecret);
  }

  async function finishWithoutCard() {
    setBusy(true);
    setError(null);
    try {
      await patchState({ completeOnboarding: true, step: "complete" });
      router.push("/dashboard?onboarding=complete");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not finish setup.");
    } finally {
      setBusy(false);
    }
  }

  async function finalizeBilling(paymentMethodId: string) {
    const res = await fetch("/api/billing/payment-method/default", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentMethodId }),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "Could not save payment method.");
    }
    await patchState({ completeOnboarding: true, step: "complete" });
    router.push("/dashboard?onboarding=complete");
    router.refresh();
  }

  if (!loaded || !state) {
    return <div className="mx-auto max-w-4xl rounded-xl border border-zinc-200 bg-white p-6">Loading setup...</div>;
  }

  const currentIdx = stepOrder.indexOf(step);

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Guided setup</h1>
            <p className="text-sm text-zinc-600">
              Finish these steps once, and your team can start using LTC Manager right away.
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
        <div className="grid grid-cols-4 gap-2">
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

        {step === "locations" ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900">Initial locations (optional)</h2>
            <p className="text-sm text-zinc-600">
              Add locations now, or skip and do it later from the Units page. You can nest a location under another
              you already added (for example a servery under a building) using the optional parent field.
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
                {busy ? "Saving..." : "Save and continue"}
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

        {step === "billing" ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900">Billing card</h2>
            <p className="text-sm text-zinc-600">Add your payment method now so billing is ready when plans are enabled.</p>
            {!stripeBillingReady ? (
              <div className="space-y-3 rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-900">
                <p>
                  Stripe is not fully configured (needs both <code className="rounded bg-amber-100 px-1">STRIPE_SECRET_KEY</code> and{" "}
                  <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> in <code className="rounded bg-amber-100 px-1">.env</code>
                  ). You can finish setup now and add a card later.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void finishWithoutCard()}
                  className="app-button app-accent-button w-full font-semibold text-white disabled:opacity-70"
                >
                  {busy ? "Finishing..." : "Finish setup without card"}
                </button>
              </div>
            ) : null}
            {stripeBillingReady && !stripePromise ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Billing UI could not load. Set <code className="rounded bg-zinc-100 px-1">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> and restart the dev server.
              </p>
            ) : null}
            {stripeBillingReady && !clientSecret ? (
              <button
                type="button"
                onClick={() => void beginBilling()}
                className="app-button app-accent-button w-full font-semibold text-white"
              >
                Load secure card form
              </button>
            ) : null}
            {stripeBillingReady && stripePromise && clientSecret ? (
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <BillingCardForm onSuccess={finalizeBilling} />
              </Elements>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      </article>
    </section>
  );
}
