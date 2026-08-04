import { AppShell } from "@/components/app-shell";

/** Auth + cookies live under `AppShell`; force dynamic so prerender never runs client nav without a router. */
export const dynamic = "force-dynamic";

type ProtectedLayoutProps = {
  children: React.ReactNode;
};

export default function ProtectedLayout({ children }: ProtectedLayoutProps) {
  return <AppShell>{children}</AppShell>;
}
