"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  addBillingDepartmentsAction,
  startBillingCheckoutAction,
  type BillingActionState,
} from "@/app/(protected)/admin/billing/actions";
import type { FacilityDepartmentCatalogItem } from "@/lib/department-products/facility-catalog";

const initialState: BillingActionState = { error: null };

type DepartmentMarketplaceProps = {
  catalog: FacilityDepartmentCatalogItem[];
  alreadySubscribed: boolean;
  checkoutReady: boolean;
  canPurchase: boolean;
};

export function DepartmentMarketplace({
  catalog,
  alreadySubscribed,
  checkoutReady,
  canPurchase,
}: DepartmentMarketplaceProps) {
  const [checkoutState, checkoutAction] = useActionState(startBillingCheckoutAction, initialState);
  const [addState, addAction] = useActionState(addBillingDepartmentsAction, initialState);
  const error = alreadySubscribed ? addState.error : checkoutState.error;
  const addable = catalog.filter((item) => item.availableToAdd);

  return (
    <div className="space-y-4" data-testid="department-marketplace">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Department Marketplace</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Vssyl-authored Department Products available for this facility.
          </p>
        </div>
        <Link
          href="/build/departments?all=1"
          className="shrink-0 text-sm font-medium text-zinc-700 hover:text-zinc-900"
        >
          Back
        </Link>
      </div>

      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}

      {catalog.length === 0 ? (
        <p className="rounded-lg border border-zinc-200 bg-white px-4 py-6 text-sm text-zinc-600">
          No Department Products are available to add right now.
        </p>
      ) : (
        <ul className="grid gap-4">
          {catalog.map((product) => (
            <li key={product.productKey}>
              <article
                className="rounded-lg border border-zinc-200 bg-white px-4 py-4"
                data-testid={`department-product-card-${product.productKey.toLowerCase()}`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-zinc-900">{product.name}</h3>
                    {product.shortDescription ? (
                      <p className="mt-0.5 text-sm text-zinc-600">{product.shortDescription}</p>
                    ) : null}
                    {product.customerCapabilities.length > 0 ? (
                      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-700">
                        {product.customerCapabilities.map((capability) => (
                          <li key={capability}>{capability}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <div className="shrink-0">
                    {product.installed ? (
                      <span
                        className="inline-flex rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800"
                        data-testid="department-product-installed"
                      >
                        Installed
                      </span>
                    ) : canPurchase && product.availableToAdd ? (
                      <form action={alreadySubscribed ? addAction : checkoutAction}>
                        <input type="hidden" name="departmentKey" value={product.productKey} />
                        {!alreadySubscribed ? (
                          <>
                            <input type="hidden" name="interval" value="ANNUAL" />
                            <input type="hidden" name="setupPath" value="SELF_SERVE" />
                            <input type="hidden" name="returnTo" value="departments" />
                          </>
                        ) : (
                          <input type="hidden" name="returnTo" value="department-builder" />
                        )}
                        <MarketplaceAddSubmit
                          disabled={!checkoutReady}
                          alreadySubscribed={alreadySubscribed}
                        />
                      </form>
                    ) : null}
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      {canPurchase && addable.length > 0 && !checkoutReady ? (
        <p className="text-sm text-amber-800">
          Stripe is not configured, so a new Department cannot be licensed here yet.
        </p>
      ) : null}
    </div>
  );
}

function MarketplaceAddSubmit({
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
      className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
      data-testid="marketplace-add-department"
    >
      {pending ? (alreadySubscribed ? "Adding…" : "Opening checkout…") : alreadySubscribed ? "Add" : "Subscribe"}
    </button>
  );
}
