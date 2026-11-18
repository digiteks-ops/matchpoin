-- Migration 0017: Tournament registration approval audit log
-- Records all approval/rejection actions by Super Admin for traceability.

CREATE TABLE IF NOT EXISTS tournament_registration_audit_logs (
  id CHAR(36) NOT NULL,
  registration_id CHAR(36) NOT NULL,
  tournament_id CHAR(36) NOT NULL,
  action VARCHAR(24) NOT NULL,
  actor_id CHAR(36) NOT NULL,
  previous_status VARCHAR(24) NOT NULL,
  new_status VARCHAR(24) NOT NULL,
  reason VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tournament_reg_audit_registration (registration_id),
  KEY idx_tournament_reg_audit_tournament (tournament_id, created_at),
  KEY idx_tournament_reg_audit_actor (actor_id, created_at),
  CONSTRAINT fk_tournament_reg_audit_registration FOREIGN KEY (registration_id) REFERENCES tournament_participants (id) ON DELETE CASCADE,
  CONSTRAINT fk_tournament_reg_audit_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments (id) ON DELETE CASCADE,
  CONSTRAINT fk_tournament_reg_audit_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT chk_tournament_reg_audit_action CHECK (action IN ('approved', 'rejected')),
  CONSTRAINT chk_tournament_reg_audit_status CHECK (
    previous_status IN ('pending', 'confirmed', 'rejected', 'waiting_list') AND
    new_status IN ('pending', 'confirmed', 'rejected', 'waiting_list')
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Add index for finding pending registrations efficiently
CREATE INDEX idx_tournament_participants_tournament_status
  ON tournament_participants (tournament_id, status);