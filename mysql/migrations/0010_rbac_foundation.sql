CREATE TABLE IF NOT EXISTS roles (
  id CHAR(36) NOT NULL,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(80) NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (code),
  CONSTRAINT chk_roles_code CHECK (code IN ('player', 'admin', 'super_admin'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO roles (id, code, name)
VALUES
  (UUID(), 'player', 'Player'),
  (UUID(), 'admin', 'Admin'),
  (UUID(), 'super_admin', 'Super Admin')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  is_system = TRUE;

CREATE TABLE IF NOT EXISTS user_roles (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  role_id CHAR(36) NOT NULL,
  assigned_by CHAR(36) NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_by CHAR(36) NULL,
  revoked_at TIMESTAMP NULL,
  reason VARCHAR(255) NULL,
  active_role_id CHAR(36) GENERATED ALWAYS AS (
    CASE WHEN revoked_at IS NULL THEN role_id ELSE NULL END
  ) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_roles_active (user_id, active_role_id),
  KEY idx_user_roles_user (user_id, revoked_at),
  KEY idx_user_roles_role (role_id, revoked_at),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE RESTRICT,
  CONSTRAINT fk_user_roles_assigned_by FOREIGN KEY (assigned_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_user_roles_revoked_by FOREIGN KEY (revoked_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS role_audit_logs (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  role_id CHAR(36) NULL,
  action VARCHAR(24) NOT NULL,
  actor_id CHAR(36) NULL,
  reason VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_role_audit_logs_user (user_id, created_at),
  KEY idx_role_audit_logs_actor (actor_id, created_at),
  CONSTRAINT fk_role_audit_logs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_role_audit_logs_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE SET NULL,
  CONSTRAINT fk_role_audit_logs_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_role_audit_logs_action CHECK (action IN ('assigned', 'revoked', 'changed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO user_roles (id, user_id, role_id, reason)
SELECT UUID(), users.id, roles.id, 'Backfill player role'
FROM users
JOIN roles ON roles.code = 'player'
WHERE NOT EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_roles.user_id = users.id
      AND user_roles.role_id = roles.id
      AND user_roles.revoked_at IS NULL
  );

INSERT INTO role_audit_logs (id, user_id, role_id, action, reason)
SELECT UUID(), user_roles.user_id, user_roles.role_id, 'assigned', 'Backfill player role'
FROM user_roles
JOIN roles ON roles.id = user_roles.role_id
WHERE roles.code = 'player'
  AND user_roles.reason = 'Backfill player role'
  AND NOT EXISTS (
    SELECT 1 FROM role_audit_logs
    WHERE role_audit_logs.user_id = user_roles.user_id
      AND role_audit_logs.role_id = user_roles.role_id
      AND role_audit_logs.reason = 'Backfill player role'
  );

INSERT INTO user_roles (id, user_id, role_id, reason)
SELECT UUID(), admin_users.user_id, roles.id, 'Backfill from admin_users'
FROM admin_users
JOIN roles ON roles.code = 'admin'
WHERE admin_users.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_roles.user_id = admin_users.user_id
      AND user_roles.role_id = roles.id
      AND user_roles.revoked_at IS NULL
  );

INSERT INTO role_audit_logs (id, user_id, role_id, action, reason)
SELECT UUID(), user_roles.user_id, user_roles.role_id, 'assigned', 'Backfill from admin_users'
FROM user_roles
JOIN roles ON roles.id = user_roles.role_id
WHERE roles.code = 'admin'
  AND user_roles.reason = 'Backfill from admin_users'
  AND NOT EXISTS (
    SELECT 1 FROM role_audit_logs
    WHERE role_audit_logs.user_id = user_roles.user_id
      AND role_audit_logs.role_id = user_roles.role_id
      AND role_audit_logs.reason = 'Backfill from admin_users'
  );
