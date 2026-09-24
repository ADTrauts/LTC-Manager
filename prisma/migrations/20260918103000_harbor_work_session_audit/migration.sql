-- Harbor work-session audit. Staff remain PlatformStaff; they never become a facility User.

ALTER TYPE "HarborAuditAction" ADD VALUE IF NOT EXISTS 'WORK_SESSION_START';
ALTER TYPE "HarborAuditAction" ADD VALUE IF NOT EXISTS 'WORK_SESSION_END';
