import Link from "next/link";
import { FACILITY_OPERATIONS_PAUSED_MESSAGE } from "@/lib/facility-operations-suspension";

/** Internal reasons remain in the OWNER history. This notice never grants access to its links. */
export function FacilityOperationsPauseBanner({ administrator = false }: { administrator?: boolean }) {
  return <aside role="status" className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
    <p className="font-semibold">Facility operational changes are paused</p>
    <p>{FACILITY_OPERATIONS_PAUSED_MESSAGE}</p>
    <div className="mt-2 flex gap-4">
      {administrator ? <Link href="/admin/billing" prefetch={false} className="underline">Billing</Link> : null}
      <Link href="/help" prefetch={false} className="underline">Help and Support</Link>
    </div>
  </aside>;
}
