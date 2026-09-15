import { RunBuildPreview } from "@/components/design-lab/run-build-preview";

type PageProps = {
  searchParams: Promise<{ mode?: string; strength?: string }>;
};

export default async function RunBuildPreviewPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const mode = params.mode === "build" ? "build" : "run";
  const strength = params.strength === "clear" ? "clear" : "current";

  return <RunBuildPreview mode={mode} strength={strength} />;
}
