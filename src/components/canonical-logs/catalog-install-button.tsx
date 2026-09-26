"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { installCatalogAction } from "@/app/(protected)/build/logs/actions";

type Props = {
  catalogStableKey: string;
  size?: "compact" | "default";
};

export function CatalogInstallButton({ catalogStableKey, size = "compact" }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        data-testid="catalog-install"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await installCatalogAction(catalogStableKey);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
        className={
          size === "default"
            ? "inline-flex min-h-11 items-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            : "inline-flex min-h-9 items-center rounded-md border border-zinc-900 bg-zinc-900 px-2.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        }
      >
        {pending ? "Installing…" : "Install"}
      </button>
      {error ? (
        <p className="text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
