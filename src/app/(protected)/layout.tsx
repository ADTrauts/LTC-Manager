import { AppShell } from "@/components/app-shell";

type ProtectedLayoutProps = {
  children: React.ReactNode;
};

export default function ProtectedLayout({ children }: ProtectedLayoutProps) {
  return <AppShell>{children}</AppShell>;
}
