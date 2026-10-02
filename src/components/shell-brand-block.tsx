import { VssylLockup } from "@/components/brand/vssyl-lockup";

type ShellBrandBlockProps = {
  facilityName: string;
};

/**
 * Product lockup + facility context in the shell header.
 * Account control owns signed-in identity; this block is name only.
 */
export function ShellBrandBlock({ facilityName }: ShellBrandBlockProps) {
  return (
    <div className="flex min-w-0 max-w-[9rem] shrink flex-col justify-center gap-0.5 sm:max-w-[12rem] lg:max-w-[15rem] lg:shrink-0">
      <VssylLockup tone="brand" size="header" />
      <p
        className="truncate text-xs font-medium leading-snug text-zinc-600"
        title={facilityName}
        aria-label={`Facility: ${facilityName}`}
      >
        {facilityName}
      </p>
    </div>
  );
}
