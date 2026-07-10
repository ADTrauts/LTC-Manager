import { AppIcons } from "@/lib/design-system";

type ShellBrandBlockProps = {
  facilityName: string;
  sessionLabel: string;
};

export function ShellBrandBlock({ facilityName, sessionLabel }: ShellBrandBlockProps) {
  const FacilityIcon = AppIcons.facility;
  const UserIcon = AppIcons.user;

  return (
    <div className="flex min-w-0 max-w-[9rem] shrink-0 items-center gap-2 sm:max-w-[11rem] lg:max-w-[13rem] lg:gap-2.5">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 sm:h-9 sm:w-9"
        aria-hidden
      >
        <FacilityIcon className="h-3.5 w-3.5 text-zinc-600 sm:h-4 sm:w-4" />
      </div>
      <div className="min-w-0 overflow-hidden">
        <p className="truncate text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-zinc-500">
          LTC Manager
        </p>
        <p
          className="mt-0.5 truncate text-sm font-semibold leading-tight text-zinc-900"
          title={facilityName}
        >
          {facilityName}
        </p>
        <p
          className="mt-0.5 hidden min-w-0 items-center gap-1 truncate text-[11px] leading-none text-zinc-500 sm:flex"
          title={sessionLabel}
        >
          <UserIcon className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
          <span className="truncate">{sessionLabel}</span>
        </p>
      </div>
    </div>
  );
}
