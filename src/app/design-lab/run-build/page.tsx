import { RunBuildPreview } from "@/components/design-lab/run-build-preview";

type PageProps = {
  searchParams: Promise<{ mode?: string; strength?: string; accent?: string }>;
};

export default async function RunBuildPreviewPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const mode = params.mode === "build" ? "build" : "run";
  const strength = params.strength === "bold" ? "bold" : "current";
  const accent =
    params.accent === "orange" || params.accent === "purple" || params.accent === "teal"
      ? params.accent
      : "teal";

  return <RunBuildPreview mode={mode} strength={strength} accent={accent} />;
}
