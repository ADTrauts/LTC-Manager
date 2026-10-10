import { Suspense } from "react";

import { AcceptEmployeeLinkForm } from "./accept-form";

export default function AcceptEmployeeLinkPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-lg px-4 py-16 text-sm text-zinc-600">Loading…</main>}>
      <AcceptEmployeeLinkForm />
    </Suspense>
  );
}
