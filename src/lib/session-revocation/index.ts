export {
  INITIAL_SESSION_VERSION,
  revokeEmployeeSessions,
  revokeEmployeeSessionsMany,
  revokeUserSessions,
  revokeUserSessionsMany,
  validateSessionAuthority,
  classifySessionRejection,
  type PrismaLike,
  type SessionRejection,
  type SessionRejectionClass,
  type SessionValidation,
} from "./session-version";

export { currentSessionVersionFor, validateSessionForRequest } from "./request-validation";

export {
  NON_REVOKING_CHANGES,
  describeRevocation,
  employeeRevocationReasons,
  userRevocationReasons,
  type EmployeeAuthoritySnapshot,
  type RevocationReason,
  type UserAuthoritySnapshot,
} from "./triggers";

export {
  revokeEmployeeSessionsAdministratively,
  revokeOwnSessions,
  type AdministrativeRevokeFailure,
  type AdministrativeRevokeResult,
} from "./administrative-revoke";
