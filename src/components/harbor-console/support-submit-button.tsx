"use client";

import { useFormStatus } from "react-dom";

const VARIANT_CLASS = {
  primary: "bg-[var(--run-aside)] text-[var(--run-aside-fg)]",
  secondary: "border border-[var(--border-strong)] bg-white text-[var(--foreground)]",
} as const;

export function SupportSubmitButton({
  children,
  pendingLabel,
  variant = "primary",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  variant?: keyof typeof VARIANT_CLASS;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold disabled:opacity-60 ${VARIANT_CLASS[variant]}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
