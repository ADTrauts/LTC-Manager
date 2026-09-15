import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from "react";

import { FOCUS_RING_INPUT_CLASS } from "@/lib/design-system/focus";

const CONTROL_CLASS = `w-full min-h-10 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400 ${FOCUS_RING_INPUT_CLASS}`;

export type FieldProps = {
  label: string;
  htmlFor?: string;
  required?: boolean;
  helper?: string;
  error?: string;
  children: ReactNode;
  className?: string;
};

/**
 * Label + control association wrapper. Pass `htmlFor` matching the control id,
 * or nest a single control and let Field generate ids via TextInput/Select.
 */
export function Field({
  label,
  htmlFor,
  required = false,
  helper,
  error,
  children,
  className = "",
}: FieldProps) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`.trim()}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-zinc-700">
        {label}
        {required ? (
          <span className="ml-0.5 text-red-700" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : helper ? (
        <p className="text-xs text-zinc-500">{helper}</p>
      ) : null}
    </div>
  );
}

export type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id?: string;
  label: string;
  helper?: string;
  error?: string;
  fieldClassName?: string;
};

export function TextInput({
  label,
  helper,
  error,
  required,
  className = "",
  fieldClassName = "",
  id: idProp,
  ...rest
}: TextInputProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <Field
      label={label}
      htmlFor={id}
      required={required}
      helper={helper}
      error={error}
      className={fieldClassName}
    >
      <input
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        className={`${CONTROL_CLASS} ${className}`.trim()}
        {...rest}
      />
    </Field>
  );
}

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  id?: string;
  label: string;
  helper?: string;
  error?: string;
  fieldClassName?: string;
  children: ReactNode;
};

export function Select({
  label,
  helper,
  error,
  required,
  className = "",
  fieldClassName = "",
  id: idProp,
  children,
  ...rest
}: SelectProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <Field
      label={label}
      htmlFor={id}
      required={required}
      helper={helper}
      error={error}
      className={fieldClassName}
    >
      <select
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        className={`${CONTROL_CLASS} ${className}`.trim()}
        {...rest}
      >
        {children}
      </select>
    </Field>
  );
}

export type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  id?: string;
  label: string;
  helper?: string;
  error?: string;
  fieldClassName?: string;
};

export function TextArea({
  label,
  helper,
  error,
  required,
  className = "",
  fieldClassName = "",
  id: idProp,
  ...rest
}: TextAreaProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <Field
      label={label}
      htmlFor={id}
      required={required}
      helper={helper}
      error={error}
      className={fieldClassName}
    >
      <textarea
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        className={`min-h-[4.5rem] w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:bg-zinc-50 ${FOCUS_RING_INPUT_CLASS} ${className}`.trim()}
        {...rest}
      />
    </Field>
  );
}

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> & {
  id?: string;
  label: string;
  helper?: string;
  error?: string;
  fieldClassName?: string;
};

export function Checkbox({
  label,
  helper,
  error,
  className = "",
  fieldClassName = "",
  id: idProp,
  ...rest
}: CheckboxProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${fieldClassName}`.trim()}>
      <label htmlFor={id} className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm text-zinc-800">
        <input
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          className={`h-4 w-4 shrink-0 rounded border-zinc-300 text-zinc-900 ${FOCUS_RING_INPUT_CLASS} ${className}`.trim()}
          {...rest}
        />
        <span>{label}</span>
      </label>
      {error ? (
        <p className="text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : helper ? (
        <p className="text-xs text-zinc-500">{helper}</p>
      ) : null}
    </div>
  );
}

export const formControlClassName = CONTROL_CLASS;
