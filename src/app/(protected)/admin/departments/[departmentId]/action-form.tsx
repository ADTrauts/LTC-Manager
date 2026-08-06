"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

type ActionResultLike =
  | { ok: true; message?: string; profileId?: string; cycleId?: string }
  | { ok: false; message: string; errors?: string[] };

type Props = {
  action: (formData: FormData) => Promise<ActionResultLike>;
  children: ReactNode;
  className?: string;
  onSuccessRedirect?: (result: ActionResultLike) => string | null;
};

/**
 * Thin client wrapper around server actions that return ActionResult.
 * Keeps business rules on the server; only surfaces success/error messages.
 */
export function DepartmentAdminActionForm({
  action,
  children,
  className,
  onSuccessRedirect,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        setMessage(null);
        setError(null);
        startTransition(async () => {
          const result = await action(formData);
          if (result.ok) {
            setMessage(result.message ?? "Saved.");
            const href = onSuccessRedirect?.(result) ?? null;
            if (href) {
              router.push(href);
            } else {
              router.refresh();
            }
          } else {
            const detail = result.errors?.length
              ? `${result.message} ${result.errors.join(" ")}`
              : result.message;
            setError(detail);
          }
        });
      }}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {message ? (
        <p className="mt-2 text-xs text-emerald-700" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
