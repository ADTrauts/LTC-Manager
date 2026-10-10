import { GlobalUserLayout } from "@/components/global-user-layout";

export const dynamic = "force-dynamic";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <GlobalUserLayout>{children}</GlobalUserLayout>;
}
