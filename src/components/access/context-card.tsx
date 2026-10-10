import { OpenContextButton } from "@/components/access/open-context-button";
import { typeClasses } from "@/lib/design-system";

export type ContextCardProps = {
  title: string;
  subtitle: string;
  contextKey: string;
  departmentSummary?: string | null;
  isHome?: boolean;
  isCurrent?: boolean;
};

export function ContextCard({
  title,
  subtitle,
  contextKey,
  departmentSummary = null,
  isHome = false,
  isCurrent = false,
}: ContextCardProps) {
  return (
    <article
      className="flex flex-col justify-between rounded-lg border border-zinc-200 bg-white p-4"
      aria-current={isCurrent ? "true" : undefined}
    >
      <div>
        <h3 className={typeClasses.rowTitle}>{title}</h3>
        <p className={`mt-1 ${typeClasses.meta}`}>{subtitle}</p>
        {departmentSummary ? <p className={`mt-2 ${typeClasses.meta}`}>{departmentSummary}</p> : null}
        {isHome || isCurrent ? (
          <p className="mt-3 flex flex-wrap gap-2">
            {isHome ? (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                Home
              </span>
            ) : null}
            {isCurrent ? (
              <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white">
                Current
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
      <div className="mt-4">
        <OpenContextButton contextKey={contextKey} />
      </div>
    </article>
  );
}
