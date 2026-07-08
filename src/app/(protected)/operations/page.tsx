import { redirect } from "next/navigation";

type OperationsAliasPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OperationsAliasPage({ searchParams }: OperationsAliasPageProps) {
  const query = searchParams ? await searchParams : {};
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") {
      params.set(key, value);
    }
  }
  const suffix = params.toString();
  redirect(suffix ? `/dashboard?${suffix}` : "/dashboard");
}
