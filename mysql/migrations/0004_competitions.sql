CREATE TABLE IF NOT EXISTS tournaments (
  id CHAR(36) NOT NULL,
  name VARCHAR(180) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  description TEXT NULL,
  category VARCHAR(32) NULL,
  season VARCHAR(80) NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  registration_deadline DATE NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  max_participants INT NOT NULL DEFAULT 12,
  organizer_id CHAR(36) NULL,
  city_id CHAR(36) NULL,
  is_league BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tournaments_slug (slug),
  KEY idx_tournaments_status_dates (status, start_date, end_date),
  KEY idx_tournaments_league (is_league, season, category),
  CONSTRAINT fk_tournaments_organizer FOREIGN KEY (organizer_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_tournaments_city FOREIGN KEY (city_id) REFERENCES cities (id) ON DELETE SET NULL,
  CONSTRAINT chk_tournaments_dates CHECK (end_date >= start_date),
  CONSTRAINT chk_tournaments_capacity CHECK (max_participants > 0),
  CONSTRAINT chk_tournaments_category CHECK (
    category IS NULL OR category IN (
      'mens_singles', 'womens_singles', 'mens_doubles', 'womens_doubles', 'mixed_doubles'
    )
  ),
  CONSTRAINT chk_tournaments_status CHECK (
    status IN ('draft', 'registration_open', 'registration_closed', 'in_progress', 'completed', 'cancelled')
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS tournament_participants (
  id CHAR(36) NOT NULL,
  tournament_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  category VARCHAR(32) NULL,
  entry_id CHAR(36) NOT NULL,
  entry_role VARCHAR(16) NOT NULL DEFAULT 'captain',
  partner_user_id CHAR(36) NULL,
  team_name VARCHAR(160) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'confirmed',
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  active_user_id CHAR(36) GENERATED ALWAYS AS (
    CASE WHEN status <> 'rejected' THEN user_id ELSE NULL END
  ) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tournament_participant_active_user (tournament_id, active_user_id),
  KEY idx_tournament_participants_entry (entry_id),
  KEY idx_tournament_participants_user (user_id, tournament_id),
  CONSTRAINT fk_tournament_participants_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments (id) ON DELETE CASCADE,
  CONSTRAINT fk_tournament_participants_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_tournament_participants_partner FOREIGN KEY (partner_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_tournament_participants_category CHECK (
    category IS NULL OR category IN (
      'mens_singles', 'womens_singles', 'mens_doubles', 'womens_doubles', 'mixed_doubles'
    )
  ),
  CONSTRAINT chk_tournament_participants_role CHECK (entry_role IN ('captain', 'partner')),
  CONSTRAINT chk_tournament_participants_status CHECK (
    status IN ('pending', 'confirmed', 'rejected', 'waiting_list')
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS league_pairings (
  id CHAR(36) NOT NULL,
  tournament_id CHAR(36) NOT NULL,
  category VARCHAR(32) NOT NULL,
  pairing_key VARCHAR(80) NOT NULL,
  entry_a CHAR(36) NOT NULL,
  entry_b CHAR(36) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  match_id CHAR(36) NULL,
  created_by CHAR(36) NULL,
  responded_by CHAR(36) NULL,
  responded_at TIMESTAMP NULL,
  cancelled_reason TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  live_pairing_key VARCHAR(80) GENERATED ALWAYS AS (
    CASE
      WHEN status IN ('pending', 'accepted', 'completed', 'wo_approved') THEN pairing_key
      ELSE NULL
    END
  ) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_league_pairings_live (tournament_id, category, live_pairing_key),
  KEY idx_league_pairings_entries (entry_a, entry_b),
  CONSTRAINT fk_league_pairings_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments (id) ON DELETE CASCADE,
  CONSTRAINT fk_league_pairings_match FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE SET NULL,
  CONSTRAINT fk_league_pairings_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_league_pairings_responded_by FOREIGN KEY (responded_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_league_pairings_status CHECK (
    status IN ('pending', 'accepted', 'completed', 'wo_approved', 'rejected', 'cancelled', 'expired')
  ),
  CONSTRAINT chk_league_pairings_distinct_entries CHECK (entry_a <> entry_b)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS league_standings (
  id CHAR(36) NOT NULL,
  tournament_id CHAR(36) NOT NULL,
  category VARCHAR(32) NULL,
  entry_id CHAR(36) NOT NULL,
  position INT NULL,
  played INT NOT NULL DEFAULT 0,
  won INT NOT NULL DEFAULT 0,
  lost INT NOT NULL DEFAULT 0,
  wo_won INT NOT NULL DEFAULT 0,
  wo_lost INT NOT NULL DEFAULT 0,
  games_won INT NOT NULL DEFAULT 0,
  games_lost INT NOT NULL DEFAULT 0,
  game_diff INT NOT NULL DEFAULT 0,
  points INT NOT NULL DEFAULT 0,
  needs_tiebreak BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_league_standings_entry (tournament_id, entry_id),
  KEY idx_league_standings_rank (tournament_id, points DESC, game_diff DESC, games_won DESC),
  CONSTRAINT fk_league_standings_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS match_wo_reports (
  id CHAR(36) NOT NULL,
  match_id CHAR(36) NOT NULL,
  tournament_id CHAR(36) NULL,
  reported_by CHAR(36) NOT NULL,
  winner_user_id CHAR(36) NULL,
  reason TEXT NOT NULL,
  evidence_urls JSON NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  reviewed_by CHAR(36) NULL,
  reviewed_at TIMESTAMP NULL,
  decision_notes TEXT NULL,
  active_match_id CHAR(36) GENERATED ALWAYS AS (
    CASE WHEN status = 'pending' THEN match_id ELSE NULL END
  ) STORED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_match_wo_reports_active (active_match_id),
  KEY idx_match_wo_reports_tournament (tournament_id, status),
  CONSTRAINT fk_match_wo_reports_match FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE RESTRICT,
  CONSTRAINT fk_match_wo_reports_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments (id) ON DELETE SET NULL,
  CONSTRAINT fk_match_wo_reports_reported_by FOREIGN KEY (reported_by) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_match_wo_reports_winner FOREIGN KEY (winner_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_match_wo_reports_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_match_wo_reports_status CHECK (status IN ('pending', 'approved', 'rejected'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS match_cancellation_requests (
  id CHAR(36) NOT NULL,
  match_id CHAR(36) NOT NULL,
  requested_by CHAR(36) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  agreed_by CHAR(36) NULL,
  agreed_at TIMESTAMP NULL,
  decided_by CHAR(36) NULL,
  decided_at TIMESTAMP NULL,
  decision_notes TEXT NULL,
  active_match_id CHAR(36) GENERATED ALWAYS AS (
    CASE WHEN status = 'pending' THEN match_id ELSE NULL END
  ) STORED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_match_cancellation_active (active_match_id),
  CONSTRAINT fk_match_cancellation_match FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE RESTRICT,
  CONSTRAINT fk_match_cancellation_requested_by FOREIGN KEY (requested_by) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_match_cancellation_agreed_by FOREIGN KEY (agreed_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_match_cancellation_decided_by FOREIGN KEY (decided_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_match_cancellation_status CHECK (status IN ('pending', 'approved', 'rejected'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS admin_users (
  user_id CHAR(36) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_admin_users_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS feedback (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(320) NOT NULL,
  category VARCHAR(24) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'new',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_feedback_created (created_at),
  CONSTRAINT fk_feedback_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_feedback_category CHECK (category IN ('bug', 'feature', 'complaint', 'question', 'other'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE matches
  ADD COLUMN tournament_id CHAR(36) NULL,
  ADD COLUMN is_league_challenge BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN result_submitted_at TIMESTAMP NULL,
  ADD COLUMN result_confirmed_at TIMESTAMP NULL,
  ADD COLUMN dispute_raised_at TIMESTAMP NULL,
  ADD KEY idx_matches_tournament (tournament_id),
  ADD CONSTRAINT fk_matches_tournament FOREIGN KEY (tournament_id) REFERENCES tournaments (id) ON DELETE SET NULL;
