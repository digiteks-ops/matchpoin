-- Migration 0014: File metadata for Supabase Storage
-- Tracks all uploaded files with ownership, type, and verification status

-- File metadata table
CREATE TABLE IF NOT EXISTS file_metadata (
  id              CHAR(36)     NOT NULL,
  user_id         CHAR(36)     NOT NULL,
  storage_key     VARCHAR(512) NOT NULL,
  bucket          VARCHAR(64)  NOT NULL,
  original_name   VARCHAR(255) NOT NULL,
  content_type    VARCHAR(128) NOT NULL,
  size_bytes      BIGINT       NOT NULL,
  kind            ENUM('avatar', 'evidence', 'tournament_document') NOT NULL,
  reference_id    CHAR(36)     NULL,  -- match_id or tournament_id
  verified_at     TIMESTAMP    NULL,
  verified_by     CHAR(36)     NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_file_metadata_user (user_id, created_at),
  KEY idx_file_metadata_reference (kind, reference_id),
  KEY idx_file_metadata_unverified (verified_at, kind),
  CONSTRAINT fk_file_metadata_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_file_metadata_verified_by FOREIGN KEY (verified_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Cleanup of orphaned files should be handled by application logic
-- Run periodically via cron job or scheduled task