"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  addBillingDepartmentsAction,
  startBillingCheckoutAction,
  type BillingActionState,
} from "@/app/(protected)/admin/billing/actions";
import {
  groupCatalogByIndustry,
  type FacilityDepartmentCatalogItem,
} from "@/lib/department-products/facility-catalog";

const initialState: BillingActionState = { error: null };

type AddDepartmentFormProps = {
  available: FacilityDepartmentCatalogItem[];
  alreadySubscribed: boolean;
  checkoutReady: boolean;
};

export function AddDepartmentForm({
  available,
  alreadySubscribed,
  checkoutReady,
}: AddDepartmentFormProps) {
  const [checkoutState, checkoutAction] = useActionState(startBillingCheckoutAction, initialState);
  const [addState, addAction] = useActionState(addBillingDepartmentsAction, initialState);
  const [selectedKey, setSelectedKey] = useState<string | null>(available[0]?.productKey ?? null);
  const groups = groupCatalogByIndustry(available);
  const error = alreadySubscribed ? addState.error : checkoutState.error;

  if (available.length === 0) {
    return null;
  }

  return (
    <form
      action={alreadySubscribed ? addAction : checkoutAction}
      className="rounded-lg border border-zinc-200 bg-white px-4 py-4"
      data-testid="add-department-form"
    >
      <h2 className="text-sm font-semibold text-zinc-900">Add Department</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Select a Vssyl department your facility will operate. Licensing happens first; the
        department is installed after payment succeeds.
      </p>

      {groups.map((group) => (
        <section key={group.industry} className="mt-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">{group.label}</h3>
          <ul className="mt-2 divide-y divide-zinc-200 rounded-md border border-zinc-200">
            {group.products.map((product) => (
              <li key={product.productKey}>
                <label className="flex cursor-pointer items-start gap-3 px-3 py-3 text-sm hover:bg-zinc-50">
                  <input
                    type="radio"
                    name="departmentKey"
                    value={product.productKey}
                    checked={selectedKey === product.productKey}
                    onChange={() => setSelectedKey(product.productKey)}
                    className="mt-0.5 h-4 w-4 border-zinc-300"
                  />
                  <span>
                    <span className="font-medium text-zinc-900">{product.name}</span>
                    {product.shortDescription ? (
                      <span className="mt-0.5 block text-xs text-zinc-500">
                        {product.shortDescription}
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {!alreadySubscribed ? (
        <>
          <input type="hidden" name="interval" value="ANNUAL" />
          <input type="hidden" name="setupPath" value="SELF_SERVE" />
          <input type="hidden" name="returnTo" value="departments" />
        </>
      ) : (
        <input type="hidden" name="returnTo" value="departments" />
      )}

      {error ? (
        <p className="mt-3 text-sm text-rose-700" role="alert">
          {error}
        </p>
      ) : null}

      {!checkoutReady ? (
        <p className="mt-3 text-sm text-amber-800">
          Stripe is not configured, so licensing is unavailable here.
        </p>
      ) : null}

      <AddDepartmentSubmit
        disabled={!selectedKey || !checkoutReady}
        alreadySubscribed={alreadySubscribed}
      />
    </form>
  );
}

function AddDepartmentSubmit({
  disabled,
  alreadySubscribed,
}: {
  disabled: boolean;
  alreadySubscribed: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="mt-4 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (alreadySubscribed ? "Adding…" : "Opening checkout…") : "Add"}
    </button>
  );
}