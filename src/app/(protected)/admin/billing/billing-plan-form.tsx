"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  addBillingDepartmentsAction,
  startBillingCheckoutAction,
  startBillingPortalAction,
  type BillingActionState,
} from "@/app/(protected)/admin/billing/actions";
import {
  BILLING_LIST,
  catalogLineItemsForQuote,
  formatUsdCents,
  quoteBilling,
  type BillingInterval,
  type BillingSetupPath,
} from "@/lib/billing";
import type { FacilityBillingStatus } from "@/lib/billing/entitlement";

const initialState: BillingActionState = { error: null };

const OFFERING_LABELS = {
  FACILITY: "Facility (first department)",
  ADDITIONAL_DEPARTMENT: "Additional department",
  WHOLE_FACILITY: "Whole facility",
  SETUP_FIRST: "Assisted setup (first department)",
  SETUP_ADDITIONAL: "Assisted setup (additional department)",
} as const;

type DepartmentOption = {
  key: string;
  name: string;
};

type BillingPlanFormProps = {
  departments: DepartmentOption[];
  initialDepartmentKeys: string[];
  initialInterval: BillingInterval;
  initialSetupPath: BillingSetupPath;
  billingStatus: FacilityBillingStatus;
  hasStripeCustomer: boolean;
  checkoutReady: boolean;
  isTestMode: boolean;
  entitlementsEnforced: boolean;
};

export function BillingPlanForm({
  departments,
  initialDepartmentKeys,
  initialInterval,
  initialSetupPath,
  billingStatus,
  hasStripeCustomer,
  checkoutReady,
  isTestMode,
  entitlementsEnforced,
}: BillingPlanFormProps) {
  const [checkoutState, checkoutAction] = useActionState(startBillingCheckoutAction, initialState);
  const [addState, addAction] = useActionState(addBillingDepartmentsAction, initialState);
  const [portalState, portalAction] = useActionState(startBillingPortalAction, initialState);
  const [selectedKeys, setSelectedKeys] = useState<string[]>(initialDepartmentKeys);
  const [keysToAdd, setKeysToAdd] = useState<string[]>([]);
  const [interval, setInterval] = useState<BillingInterval>(initialInterval);
  const [setupPath, setSetupPath] = useState<BillingSetupPath>(initialSetupPath);

  const quote = useMemo(
    () =>
      quoteBilling({
        departmentCount: selectedKeys.length,
        interval,
        setupPath,
      }),
    [interval, selectedKeys.length, setupPath],
  );
  const annualQuote = useMemo(
    () =>
      quoteBilling({
        departmentCount: selectedKeys.length,
        interval: "ANNUAL",
        setupPath,
      }),
    [selectedKeys.length, setupPath],
  );
  const lineItems = useMemo(() => catalogLineItemsForQuote(quote), [quote]);
  const alreadySubscribed = billingStatus === "ACTIVE" || billingStatus === "PAST_DUE";
  const canCheckout = checkoutReady && selectedKeys.length > 0 && !alreadySubscribed;
  const includedDepartments = departments.filter((department) => selectedKeys.includes(department.key));
  const availableDepartments = departments.filter((department) => !selectedKeys.includes(department.key));
  const addQuote = useMemo(
    () =>
      quoteBilling({
        departmentCount: selectedKeys.length + keysToAdd.length,
        interval,
        setupPath: "SELF_SERVE",
      }),
    [interval, keysToAdd.length, selectedKeys.length],
  );

  function toggleDepartmentToAdd(key: string) {
    setKeysToAdd((current) =>
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
    );
  }

  function toggleDepartment(key: string) {
    if (alreadySubscribed) return;
    setSelectedKeys((current) =>
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
    );
  }

  return (
    <div className="space-y-6">
      {isTestMode ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Stripe is in test mode. Use a test card at checkout; nothing live will be charged.
        </p>
      ) : null}

      {!entitlementsEnforced ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          {alreadySubscribed
            ? "This plan sets what the facility pays. It does not turn Dietary, EVS, or Plant off in the app."
            : "Choosing departments here sets what this facility pays. It does not turn Dietary, EVS, or Plant off in the app."}
        </p>
      ) : null}

      {alreadySubscribed ? (
        <section
          className="space-y-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
          data-testid="billing-plan-locked"
        >
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Current plan</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Monthly vs annual stays locked. Add departments below. Use Manage billing to update the
              card or cancel.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-zinc-800">Departments</h3>
            <ul className="mt-2 divide-y divide-zinc-200 rounded-md border border-zinc-200">
              {includedDepartments.length > 0 ? (
                includedDepartments.map((department) => (
                  <li key={department.key} className="px-3 py-3 text-sm">
                    <span className="font-medium text-zinc-900">{department.name}</span>
                    <span className="mt-0.5 block text-xs text-zinc-500">{department.key}</span>
                  </li>
                ))
              ) : (
                <li className="px-3 py-3 text-sm text-zinc-600">No departments recorded on this plan.</li>
              )}
            </ul>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-md border border-zinc-200 px-3 py-3">
              <dt className="text-zinc-500">Billing interval</dt>
              <dd className="mt-1 font-medium text-zinc-900">
                {interval === "ANNUAL" ? "Annual" : "Monthly"}
              </dd>
              <p className="mt-1 text-zinc-600">
                {interval === "ANNUAL"
                  ? `${formatUsdCents(quote.billedRecurringCents)} prepaid (10% off)`
                  : `${formatUsdCents(quote.listedMonthlyCents)} list, billed each month`}
              </p>
            </div>
            <div className="rounded-md border border-zinc-200 px-3 py-3">
              <dt className="text-zinc-500">Setup</dt>
              <dd className="mt-1 font-medium text-zinc-900">
                {setupPath === "ASSISTED" ? "Assisted implementation" : "Self-setup"}
              </dd>
              <p className="mt-1 text-zinc-600">
                {setupPath === "ASSISTED" ? "One-time implementation fee applied at checkout." : "No implementation fee."}
              </p>
            </div>
          </dl>

          <section className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3" data-testid="billing-quote">
            <h3 className="text-sm font-semibold text-zinc-900">Current charges</h3>
            <ul className="mt-2 space-y-1 text-sm text-zinc-700">
              {lineItems
                .filter((item) => item.interval)
                .map((item) => (
                  <li key={`${item.offering}-${item.interval}`} className="flex justify-between gap-4">
                    <span>
                      {OFFERING_LABELS[item.offering]}
                      {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                    </span>
                    <span className="tabular-nums">{formatUsdCents(item.unitAmountCents * item.quantity)}</span>
                  </li>
                ))}
              <li className="flex justify-between gap-4 border-t border-zinc-200 pt-2 font-medium text-zinc-900">
                <span>{interval === "ANNUAL" ? "Billed annually" : "Billed monthly"}</span>
                <span className="tabular-nums">{formatUsdCents(quote.billedRecurringCents)}</span>
              </li>
            </ul>
          </section>
        </section>
      ) : null}

      {alreadySubscribed && availableDepartments.length > 0 ? (
        <form
          action={addAction}
          className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
          data-testid="billing-add-departments"
        >
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Add departments</h2>
            <p className="mt-1 text-sm text-zinc-600">
              {billingStatus === "PAST_DUE"
                ? "Update the card in Manage billing before adding departments."
                : "This updates the current subscription. Stripe charges a prorated amount for the rest of this billing period."}
            </p>
          </div>

          <fieldset className="space-y-2" disabled={billingStatus !== "ACTIVE"}>
            <legend className="sr-only">Departments to add</legend>
            <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200">
              {availableDepartments.map((department) => {
                const checked = keysToAdd.includes(department.key);
                return (
                  <li key={department.key}>
                    <label className="flex cursor-pointer items-start gap-3 px-3 py-3 text-sm hover:bg-zinc-50">
                      <input
                        type="checkbox"
                        name="departmentKey"
                        value={department.key}
                        checked={checked}
                        onChange={() => toggleDepartmentToAdd(department.key)}
                        className="mt-0.5 h-4 w-4 rounded border-zinc-300"
                      />
                      <span>
                        <span className="font-medium text-zinc-900">{department.name}</span>
                        <span className="mt-0.5 block text-xs text-zinc-500">{department.key}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>

          {keysToAdd.length > 0 ? (
            <p className="text-sm text-zinc-700">
              New list:{" "}
              <span className="font-medium tabular-nums">{formatUsdCents(addQuote.billedRecurringCents)}</span>{" "}
              {interval === "ANNUAL" ? "per year" : "per month"}
              {addQuote.billedRecurringCents !== quote.billedRecurringCents
                ? ` (was ${formatUsdCents(quote.billedRecurringCents)})`
                : " — already at the whole-facility ceiling"}
              .
            </p>
          ) : null}

          {addState.error ? (
            <p className="text-sm text-rose-700" role="alert">
              {addState.error}
            </p>
          ) : null}

          <AddDepartmentsSubmit
            disabled={billingStatus !== "ACTIVE" || keysToAdd.length === 0 || !checkoutReady}
          />
        </form>
      ) : null}

      {!alreadySubscribed ? (
      <form action={checkoutAction} className="space-y-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Plan</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Unlimited users. Price follows the operational departments you include.
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-zinc-800">Departments</legend>
          <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200">
            {departments.map((department) => {
              const checked = selectedKeys.includes(department.key);
              return (
                <li key={department.key}>
                  <label className="flex cursor-pointer items-start gap-3 px-3 py-3 text-sm hover:bg-zinc-50">
                    <input
                      type="checkbox"
                      name="departmentKey"
                      value={department.key}
                      checked={checked}
                      onChange={() => toggleDepartment(department.key)}
                      className="mt-0.5 h-4 w-4 rounded border-zinc-300"
                    />
                    <span>
                      <span className="font-medium text-zinc-900">{department.name}</span>
                      <span className="mt-0.5 block text-xs text-zinc-500">{department.key}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">Billing interval</legend>
          <IntervalOption
            value="MONTHLY"
            current={interval}
            onChange={setInterval}
            title="Monthly"
            detail={`${formatUsdCents(quote.listedMonthlyCents)} list, billed each month`}
          />
          <IntervalOption
            value="ANNUAL"
            current={interval}
            onChange={setInterval}
            title="Annual"
            detail={`${formatUsdCents(annualQuote.billedRecurringCents)} prepaid (10% off)`}
          />
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-zinc-800">Setup</legend>
          <label className="flex items-start gap-3 rounded-md border border-zinc-200 px-3 py-3 text-sm">
            <input
              type="radio"
              name="setupPath"
              value="SELF_SERVE"
              checked={setupPath === "SELF_SERVE"}
              onChange={() => setSetupPath("SELF_SERVE")}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-zinc-900">Self-setup</span>
              <span className="mt-0.5 block text-zinc-600">No implementation fee.</span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-md border border-zinc-200 px-3 py-3 text-sm">
            <input
              type="radio"
              name="setupPath"
              value="ASSISTED"
              checked={setupPath === "ASSISTED"}
              onChange={() => setSetupPath("ASSISTED")}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-zinc-900">Assisted implementation</span>
              <span className="mt-0.5 block text-zinc-600">
                {formatUsdCents(BILLING_LIST.setupFirstDepartmentCents)} for the first department,{" "}
                {formatUsdCents(BILLING_LIST.setupAdditionalDepartmentCents)} each additional, billed once.
              </span>
            </span>
          </label>
        </fieldset>

        <section className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3" data-testid="billing-quote">
          <h3 className="text-sm font-semibold text-zinc-900">Quote</h3>
          {selectedKeys.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-600">Select at least one department to see pricing.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-zinc-700">
              {lineItems.map((item) => (
                <li key={`${item.offering}-${item.interval ?? "once"}`} className="flex justify-between gap-4">
                  <span>
                    {OFFERING_LABELS[item.offering]}
                    {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                  </span>
                  <span className="tabular-nums">
                    {formatUsdCents(item.unitAmountCents * item.quantity)}
                  </span>
                </li>
              ))}
              <li className="flex justify-between gap-4 border-t border-zinc-200 pt-2 font-medium text-zinc-900">
                <span>{interval === "ANNUAL" ? "Billed annually" : "Billed monthly"}</span>
                <span className="tabular-nums">{formatUsdCents(quote.billedRecurringCents)}</span>
              </li>
              {quote.setupFeeCents > 0 ? (
                <li className="flex justify-between gap-4 text-zinc-700">
                  <span>One-time setup</span>
                  <span className="tabular-nums">{formatUsdCents(quote.setupFeeCents)}</span>
                </li>
              ) : null}
              {quote.atFacilityCeiling ? (
                <li className="pt-1 text-xs text-zinc-500">
                  Whole-facility ceiling of {formatUsdCents(BILLING_LIST.facilityCeilingMonthlyCents)} / month.
                </li>
              ) : null}
            </ul>
          )}
        </section>

        {checkoutState.error ? (
          <p className="text-sm text-rose-700" role="alert">
            {checkoutState.error}
          </p>
        ) : null}

        {!checkoutReady && !alreadySubscribed ? (
          <p className="text-sm text-amber-800">
            Stripe keys or price IDs are not configured, so checkout is unavailable. The quote above is still the
            commercial list.
          </p>
        ) : null}

        <CheckoutSubmit disabled={!canCheckout} />
      </form>
      ) : null}

      {hasStripeCustomer ? (
        <form
          action={portalAction}
          className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-zinc-900">Payment & invoices</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Update the card, download invoices, or cancel at period end. Add departments in the
            section above — Stripe’s portal cannot change which departments this facility pays for.
          </p>
          {portalState.error ? (
            <p className="mt-3 text-sm text-rose-700" role="alert">
              {portalState.error}
            </p>
          ) : null}
          <PortalSubmit />
        </form>
      ) : null}
    </div>
  );
}

function IntervalOption({
  value,
  current,
  onChange,
  title,
  detail,
}: {
  value: BillingInterval;
  current: BillingInterval;
  onChange: (value: BillingInterval) => void;
  title: string;
  detail: string;
}) {
  const selected = current === value;
  return (
    <label
      className={`flex cursor-pointer flex-col rounded-md border px-3 py-3 text-sm ${
        selected ? "border-zinc-900 bg-zinc-50" : "border-zinc-200"
      }`}
    >
      <span className="flex items-center gap-2 font-medium text-zinc-900">
        <input
          type="radio"
          name="interval"
          value={value}
          checked={selected}
          onChange={() => onChange(value)}
          className="h-4 w-4"
        />
        {title}
      </span>
      <span className="mt-1 text-zinc-600">{detail}</span>
    </label>
  );
}

function AddDepartmentsSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Updating subscription..." : "Add to plan"}
    </button>
  );
}

function CheckoutSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Opening checkout..." : "Continue to checkout"}
    </button>
  );
}

function PortalSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-4 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
    >
      {pending ? "Opening..." : "Manage billing"}
    </button>
  );
}
