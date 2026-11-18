CREATE TABLE matches (
  id CHAR(36) NOT NULL,
  title VARCHAR(100) NOT NULL,
  description TEXT NULL,
  court_id CHAR(36) NULL,
  organizer_id CHAR(36) NOT NULL,
  match_date DATE NOT NULL,
  start_time TIME NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 90,
  max_players INT NOT NULL,
  current_players INT NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT 'open',
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  cancellation_reason TEXT NULL,
  cancelled_at TIMESTAMP NULL,
  cancelled_by CHAR(36) NULL,
  metadata JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_matches_status_date (status, match_date, start_time),
  KEY idx_matches_organizer (organizer_id, match_date),
  KEY idx_matches_court (court_id),
  CONSTRAINT fk_matches_court FOREIGN KEY (court_id) REFERENCES tennis_courts (id) ON DELETE SET NULL,
  CONSTRAINT fk_matches_organizer FOREIGN KEY (organizer_id) REFERENCES users (id),
  CONSTRAINT fk_matches_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_matches_duration CHECK (duration_minutes BETWEEN 30 AND 300),
  CONSTRAINT chk_matches_players CHECK (
    max_players >= 2 AND current_players >= 0 AND current_players <= max_players
  ),
  CONSTRAINT chk_matches_status CHECK (
    status IN ('open', 'full', 'in_progress', 'completed', 'cancelled')
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE match_participants (
  id CHAR(36) NOT NULL,
  match_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  is_organizer BOOLEAN NOT NULL DEFAULT FALSE,
  team TINYINT NOT NULL DEFAULT 1,
  metadata JSON NOT NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP NULL,
  left_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY idx_match_participants_match (match_id, left_at, team),
  KEY idx_match_participants_user (user_id, left_at),
  CONSTRAINT fk_match_participants_match FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE,
  CONSTRAINT fk_match_participants_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT chk_match_participants_team CHECK (team IN (1, 2))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
