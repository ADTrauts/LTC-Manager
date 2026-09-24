"use client";

import type { SelectHTMLAttributes } from "react";

/** Saves a one-field form as soon as the value changes. */
export function AutoSubmitSelect({
  onChange,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      onChange={(event) => {
        onChange?.(event);
        event.currentTarget.form?.requestSubmit();
      }}
    >
      {children}
    </select>
  );
}
