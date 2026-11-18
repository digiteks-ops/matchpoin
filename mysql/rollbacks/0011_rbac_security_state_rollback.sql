-- Rollback for 0011_rbac_security_state.sql
-- Apply only after a verified backup and explicit approval.
-- This removes only the singleton lock table.

DROP TABLE IF EXISTS rbac_security_state;
