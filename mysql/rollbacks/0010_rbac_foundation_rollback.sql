-- Rollback for 0010_rbac_foundation.sql
-- This file is intentionally not part of the forward migration runner.
-- Apply it manually only after a verified backup and an explicit decision.
-- It removes RBAC tables only; it never touches users or player data.

DROP TABLE IF EXISTS role_audit_logs;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS roles;
