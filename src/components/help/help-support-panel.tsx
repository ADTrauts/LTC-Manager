import { AppCard, PageHeader } from "@/components/design-system";
import {
  CUSTOMER_SUPPORT_EMAIL,
  customerSupportMailtoHref,
} from "@/lib/customer-support";
import { FOCUS_RING_CLASS } from "@/lib/design-system/focus";

const PRIMARY_ACTION_CLASS = `inline-flex min-h-10 touch-manipulation items-center justify-center rounded-md border border-transparent bg-zinc-900 px-3.5 text-sm font-medium text-white hover:bg-zinc-700 ${FOCUS_RING_CLASS}`;

/** Single customer-facing Help & Support surface. Mailto only. */
export function HelpSupportPanel() {
  const mailtoHref = customerSupportMailtoHref();

  return (
    <div className="mx-auto max-w-xl space-y-6" data-testid="help-support">
      <PageHeader
        icon="help"
        title="Help & Support"
        subtitle="Need help with Vssyl? Email us for product questions, bugs, account help, or suggestions."
        compact
      />
      <AppCard data-testid="help-support-card">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Email</p>
        <a
          href={mailtoHref}
          className={`mt-1 inline-block text-base font-medium text-zinc-900 underline-offset-2 hover:underline ${FOCUS_RING_CLASS}`}
          data-testid="help-support-address"
        >
          {CUSTOMER_SUPPORT_EMAIL}
        </a>
        <div className="mt-5">
          <a
            href={mailtoHref}
            className={PRIMARY_ACTION_CLASS}
            data-testid="help-support-email"
          >
            Email Support
          </a>
        </div>
      </AppCard>
    </div>
  );
}
