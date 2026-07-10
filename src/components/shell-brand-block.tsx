import { AppIcons } from "@/lib/design-system";

type ShellBrandBlockProps = {
  facilityName: string;
  sessionLabel: string;
};

export function ShellBrandBlock({ facilityName, sessionLabel }: ShellBrandBlockProps) {
  const FacilityIcon = AppIcons.facility;
  const UserIcon = AppIcons.user;

  return (
    <div className="flex min-w-0 max-w-[11rem] shrink-0 items-center gap-2.5 sm:max-w-[13rem]">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50"
        aria-hidden
      >
        <FacilityIcon className="h-4 w-4 text-zinc-600" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-zinc-500">
          LTC Manager
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold leading-tight text-zinc-900" title={facilityName}>
          {facilityName}
        </p>
        <p
          className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-[11px] leading-none text-zinc-500"
          title={sessionLabel}
        >
          <UserIcon className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
          <span className="truncate">{sessionLabel}</span>
        </p>
      </div>
    </div>
  );
}
