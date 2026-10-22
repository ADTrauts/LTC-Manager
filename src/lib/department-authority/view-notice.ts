import { DEPARTMENT_VIEW_REASON } from "@/lib/department-authority/access";
import { isContractedDepartmentAuthorityEnabled } from "@/lib/feature-flags";

/**
 * The shared read-only notice. Null when the flag is off, so today's screens stay as they are.
 * The sentence is the view reason itself.
 */
export function departmentViewOnlyNotice(reason: string | null | undefined): string | null {
  if (!isContractedDepartmentAuthorityEnabled()) return null;
  return reason === DEPARTMENT_VIEW_REASON ? DEPARTMENT_VIEW_REASON : null;
}
