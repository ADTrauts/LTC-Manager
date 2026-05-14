import { redirect } from "next/navigation";

import { SignupForm } from "@/components/signup-form";
import { getSession } from "@/lib/auth";

export default async function SignupPage() {
  const session = await getSession();
  if (session?.facilityId) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
      <SignupForm />
    </main>
  );
}
