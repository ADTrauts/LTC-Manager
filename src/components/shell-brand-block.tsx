import { AppIcons } from "@/lib/design-system";

type ShellBrandBlockProps = {
  facilityName: string;
};

/**
 * Facility / product identity in the shell header.
 * Account control owns signed-in identity; this block is name only.
 */
export function ShellBrandBlock({ facilityName }: ShellBrandBlockProps) {
  const FacilityIcon = AppIcons.facility;

  return (
    <div className="flex min-w-0 max-w-[7.5rem] shrink items-center gap-1.5 sm:max-w-[10rem] lg:max-w-[13rem] lg:shrink-0 lg:gap-2.5">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--brand-accent)] sm:h-9 sm:w-9"
        aria-hidden
      >
        <FacilityIcon className="h-3.5 w-3.5 text-white sm:h-4 sm:w-4" />
      </div>
      <div className="min-w-0 overflow-hidden">
        <p className="truncate text-[11px] font-semibold uppercase leading-none tracking-wider text-zinc-500">
          LTC Manager
        </p>
        <p
          className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug break-words text-zinc-900 [text-wrap:balance]"
          title={facilityName}
          aria-label={`Facility: ${facilityName}`}
        >
          {facilityName}
        </p>
      </div>
    </div>
  );
}
