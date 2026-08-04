import { assertFacilityAdministratorPage } from "@/lib/facility-admin-guard";

type AdminLayoutProps = {
  children: React.ReactNode;
};

export default async function AdminLayout({ children }: AdminLayoutProps) {
  await assertFacilityAdministratorPage();
  return <>{children}</>;
}
