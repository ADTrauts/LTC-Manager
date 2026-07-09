type ShellBrandBlockProps = {
  facilityName: string;
  sessionLabel: string;
};

export function ShellBrandBlock({ facilityName, sessionLabel }: ShellBrandBlockProps) {
  return (
    <div className="min-w-0 max-w-[16rem]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">LTC Manager</p>
      <p className="truncate text-lg font-semibold leading-snug text-zinc-900 sm:text-xl">{facilityName}</p>
      <p className="truncate text-xs leading-relaxed text-zinc-500">{sessionLabel}</p>
    </div>
  );
}
