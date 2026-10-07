"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  addBillingDepartmentsAction,
  startBillingCheckoutAction,
  type BillingActionState,
} from "@/app/(protected)/admin/billing/actions";
import type { FacilityDepartmentCatalogItem } from "@/lib/department-products/facility-catalog";
import { departmentProductCoverSrc } from "@/lib/department-products/marketplace-cover";

const initialState: BillingActionState = { error: null };
const MAX_CAPABILITIES = 4;

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
          href="/admin/departments"
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
        <ul className="grid gap-4 sm:grid-cols-2">
          {catalog.map((product) => {
            const coverSrc = departmentProductCoverSrc(product.productKey);
            const summary = product.shortDescription?.trim() || product.applicabilitySummary;
            const capabilities = product.customerCapabilities.slice(0, MAX_CAPABILITIES);
            const extraCount = product.customerCapabilities.length - capabilities.length;
            return (
              <li key={product.productKey}>
                <article
                  className="flex h-full flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm"
                  data-testid={`department-product-card-${product.productKey.toLowerCase()}`}
                >
                  <div className="relative aspect-[16/10] bg-zinc-100">
                    {coverSrc ? (
                      <Image
                        src={coverSrc}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 100vw, 320px"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-zinc-200 to-zinc-100" />
                    )}
                    {product.operable ? (
                      <span
                        className="absolute right-3 top-3 inline-flex rounded-md bg-emerald-50/95 px-2.5 py-1 text-xs font-medium text-emerald-800 shadow-sm ring-1 ring-emerald-100"
                        data-testid="department-product-installed"
                      >
                        Installed
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        {product.industryLabel}
                      </p>
                      <h3 className="mt-1 text-base font-semibold tracking-tight text-zinc-900">
                        {product.name}
                      </h3>
                      {summary ? (
                        <p className="mt-1.5 line-clamp-2 text-sm text-zinc-600">{summary}</p>
                      ) : null}
                    </div>

                    {capabilities.length > 0 ? (
                      <ul className="space-y-1 text-sm text-zinc-700">
                        {capabilities.map((capability) => (
                          <li key={capability} className="flex gap-2">
                            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-zinc-400" aria-hidden />
                            <span className="min-w-0">{capability}</span>
                          </li>
                        ))}
                        {extraCount > 0 ? (
                          <li className="pl-3 text-xs text-zinc-500">+{extraCount} more</li>
                        ) : null}
                      </ul>
                    ) : null}

                    <div className="mt-auto pt-1">
                      {product.operable ? (
                        <p className="text-xs font-medium text-emerald-800">Ready in this facility</p>
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
                            <input type="hidden" name="returnTo" value="departments" />
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
            );
          })}
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
      className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
      data-testid="marketplace-add-department"
    >
      {pending ? (alreadySubscribed ? "Adding…" : "Opening checkout…") : alreadySubscribed ? "Add" : "Subscribe"}
    </button>
  );
}
