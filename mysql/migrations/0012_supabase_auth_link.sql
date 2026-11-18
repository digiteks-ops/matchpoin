-- Migration 0012: Link Supabase Auth UIDs to MySQL users
-- Adds auth_user_id column and makes password_hash nullable

-- Add auth_user_id column only if it does not exist
SET @col := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'auth_user_id');
SET @sql := IF(@col = 0,
  'ALTER TABLE users ADD COLUMN auth_user_id CHAR(36) NULL AFTER id',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Make password_hash nullable
ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL DEFAULT NULL;

-- Add unique index only if it does not exist
SET @idx := (SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'users' AND index_name = 'uq_users_auth_user_id');
SET @sql := IF(@idx = 0,
  'ALTER TABLE users ADD UNIQUE KEY uq_users_auth_user_id (auth_user_id), ADD KEY idx_users_auth_user_id (auth_user_id)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
