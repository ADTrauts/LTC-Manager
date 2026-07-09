import { AppIcons } from "@/lib/design-system";

type ShellBrandBlockProps = {
  facilityName: string;
  sessionLabel: string;
};

export function ShellBrandBlock({ facilityName, sessionLabel }: ShellBrandBlockProps) {
  const FacilityIcon = AppIcons.facility;
  const UserIcon = AppIcons.user;

  return (
    <div className="flex min-w-0 max-w-[18rem] items-start gap-3">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50"
        aria-hidden
      >
        <FacilityIcon className="h-5 w-5 text-zinc-600" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          LTC Manager
        </p>
        <p className="truncate text-lg font-semibold leading-snug text-zinc-900 sm:text-xl">
          {facilityName}
        </p>
        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-xs leading-relaxed text-zinc-500">
          <UserIcon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          <span className="truncate">{sessionLabel}</span>
        </p>
      </div>
    </div>
  );
}
