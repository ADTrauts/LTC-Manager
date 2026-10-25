import { redirect } from "next/navigation";

type WorkspacePageProps = {
  searchParams?: Promise<{
    onboarding?: string | string[] | undefined;
  }>;
};

/** DSH-04: Business Workspace opens the Dashboard. */
export default async function WorkspacePage({ searchParams }: WorkspacePageProps) {
  const query = searchParams ? await searchParams : {};
  const onboardingComplete = typeof query.onboarding === "string" && query.onboarding === "complete";
  redirect(onboardingComplete ? "/dashboard?onboarding=complete" : "/dashboard");
}
