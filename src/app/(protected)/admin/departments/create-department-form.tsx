"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createDepartmentAction } from "./actions";

export function CreateDepartmentForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      const result = await createDepartmentAction(fd);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      form.reset();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-zinc-200 bg-white px-4 py-3"
      data-testid="create-department-form"
    >
      <p className="text-sm font-medium text-zinc-900">Create a department</p>
      <p className="mt-1 text-xs text-zinc-600">
        Adds a local operating department. This is not how Vssyl Department
        Products are installed. Dietary, EVS, and Plant capabilities are not
        added automatically.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium text-zinc-700">
          Name
          <input
            name="name"
            required
            maxLength={80}
            placeholder="Department name"
            className="mt-1 block min-w-[16rem] rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-60"
        >
          {isPending ? "Creating…" : "Create department"}
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
