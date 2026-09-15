import { LockedModePreview } from "@/components/design-lab/locked-mode-preview";

type PageProps = {
  searchParams: Promise<{ mode?: string }>;
};

export default async function LockedModePreviewPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const mode = params.mode === "build" ? "build" : "run";
  return <LockedModePreview mode={mode} />;
}
