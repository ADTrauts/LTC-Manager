import { redirect } from "next/navigation";

/** Legacy path — use `/employees/separations`. */
export default function EmployeesTerminationsRedirectPage() {
  redirect("/employees/separations");
}
