"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import {
  departmentAdminHref,
  type DepartmentAdminPrimaryTabId,
  type DepartmentAdminRetiredTabId,
} from "@/lib/department-administration/admin-nav";

type ActionResultLike =
  | { ok: true; message?: string; profileId?: string; cycleId?: string; teamId?: string }
  | { ok: false; message: string; errors?: string[] };

type Props = {
  action: (formData: FormData) => Promise<ActionResultLike>;
  children: ReactNode;
  className?: string;
  /** Called after a successful save (client parents only). */
  onSuccess?: () => void;
  /** After success, open `#edit-cycle-{cycleId}` (used when forking a published cycle to draft). */
  openCycleEditorOnSuccess?: boolean;
  profileRedirect?: {
    departmentId: string;
    tab: DepartmentAdminPrimaryTabId | DepartmentAdminRetiredTabId;
    /** Preserve Room Type detail after DRAFT fork. */
    roomType?: string;
  };
};

/** Optional close signal for forms rendered inside a Drawer. */
export const DepartmentAdminFormCloseContext = createContext<(() => void) | null>(null);

/**
 * Thin client wrapper around server actions that return ActionResult.
 * Keeps business rules on the server; only surfaces success/error messages.
 */
export function DepartmentAdminActionForm({
  action,
  children,
  className,
  onSuccess,
  openCycleEditorOnSuccess = false,
  profileRedirect,
}: Props) {
  const router = useRouter();
  const closeFromContext = useContext(DepartmentAdminFormCloseContext);
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
            onSuccess?.();
            closeFromContext?.();
            if (openCycleEditorOnSuccess && result.cycleId) {
              window.location.hash = `edit-cycle-${result.cycleId}`;
            }
            let href: string | null =
              result.profileId && profileRedirect
                ? departmentAdminHref(
                    profileRedirect.departmentId,
                    profileRedirect.tab,
                    result.profileId,
                  )
                : null;
            if (href && profileRedirect?.roomType) {
              const sep = href.includes("?") ? "&" : "?";
              href = `${href}${sep}roomType=${encodeURIComponent(profileRedirect.roomType)}`;
            }
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
