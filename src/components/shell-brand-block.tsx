import { AppIcons } from "@/lib/design-system";

type ShellBrandBlockProps = {
  facilityName: string;
  sessionLabel: string;
};

export function ShellBrandBlock({ facilityName, sessionLabel }: ShellBrandBlockProps) {
  const FacilityIcon = AppIcons.facility;

  return (
    <div className="flex min-w-0 max-w-[16rem] items-start gap-2.5">
      <FacilityIcon className="mt-0.5 h-5 w-5 shrink-0 text-zinc-500" aria-hidden />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">LTC Manager</p>
        <p className="truncate text-lg font-semibold leading-snug text-zinc-900 sm:text-xl">{facilityName}</p>
        <p className="truncate text-xs leading-relaxed text-zinc-500">{sessionLabel}</p>
      </div>
    </div>
  );
}
