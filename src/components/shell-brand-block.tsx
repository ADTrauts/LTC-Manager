import { AppIcons } from "@/lib/design-system";

type ShellBrandBlockProps = {
  facilityName: string;
  sessionLabel: string;
};

/**
 * Facility / product identity in the shell header.
 * Compact widths: tighter max-width, hide signed-in subtitle (account control owns identity).
 */
export function ShellBrandBlock({ facilityName, sessionLabel }: ShellBrandBlockProps) {
  const FacilityIcon = AppIcons.facility;
  const UserIcon = AppIcons.user;

  return (
    <div className="flex min-w-0 max-w-[7.5rem] shrink items-center gap-1.5 sm:max-w-[10rem] lg:max-w-[13rem] lg:shrink-0 lg:gap-2.5">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 sm:h-9 sm:w-9"
        aria-hidden
      >
        <FacilityIcon className="h-3.5 w-3.5 text-zinc-600 sm:h-4 sm:w-4" />
      </div>
      <div className="min-w-0 overflow-hidden">
        <p className="truncate text-[11px] font-semibold uppercase leading-none tracking-wider text-zinc-500">
          LTC Manager
        </p>
        <p
          className="mt-0.5 truncate text-sm font-semibold leading-tight text-zinc-900"
          title={facilityName}
          aria-label={`Facility: ${facilityName}`}
        >
          {facilityName}
        </p>
        <p
          className="mt-0.5 hidden min-w-0 items-center gap-1 truncate text-[11px] leading-none text-zinc-500 lg:flex"
          title={sessionLabel}
        >
          <UserIcon className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
          <span className="truncate">{sessionLabel}</span>
        </p>
      </div>
    </div>
  );
}
