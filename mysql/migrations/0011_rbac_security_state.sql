CREATE TABLE IF NOT EXISTS rbac_security_state (
  id TINYINT UNSIGNED NOT NULL,
  lock_name VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rbac_security_state_name (lock_name),
  CONSTRAINT chk_rbac_security_state_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO rbac_security_state (id, lock_name)
VALUES (1, 'global-rbac-lock')
ON DUPLICATE KEY UPDATE lock_name = VALUES(lock_name);
