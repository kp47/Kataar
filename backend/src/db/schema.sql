-- queueit database schema
-- Charset/collation chosen for full emoji/unicode safety in names & comments.

CREATE DATABASE IF NOT EXISTS u281498814_queueit CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE u281498814_queueit;

-- ---------------------------------------------------------------------------
-- VENDORS (the businesses: clinics, salons, service counters, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE vendors (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_name   VARCHAR(150) NOT NULL,
  slug            VARCHAR(160) NOT NULL UNIQUE,     -- used in patient-facing URL, e.g. /q/dr-mehta-clinic
  category        VARCHAR(60)  NOT NULL DEFAULT 'Other',   -- e.g. Clinic, Salon, Bank, Government Office
  city            VARCHAR(100) NULL,
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  contact_phone   VARCHAR(30)  NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_category (category),
  KEY idx_city (city)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- VENDOR SETTINGS (one row per vendor; all the configurable queue rules)
-- ---------------------------------------------------------------------------
CREATE TABLE vendor_settings (
  vendor_id                INT UNSIGNED PRIMARY KEY,
  timezone                 VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  operational_days         JSON NOT NULL,   -- e.g. ["mon","tue","wed","thu","fri","sat"]
  open_time                TIME NOT NULL DEFAULT '09:00:00',
  close_time                TIME NOT NULL DEFAULT '18:00:00',
  default_wait_minutes     SMALLINT UNSIGNED NOT NULL DEFAULT 10,   -- vendor's manual estimate per token
  daily_capacity            SMALLINT UNSIGNED NOT NULL DEFAULT 60,   -- max tokens issued per day
  expiry_policy             ENUM('fixed_hours','end_of_day') NOT NULL DEFAULT 'fixed_hours',
  expiry_hours              DECIMAL(4,1) NOT NULL DEFAULT 2.0,       -- used when expiry_policy = fixed_hours
  grace_window_minutes      SMALLINT UNSIGNED NOT NULL DEFAULT 3,    -- time to respond once called before auto-skip
  push_bump_positions       SMALLINT UNSIGNED NOT NULL DEFAULT 4,    -- how many places you drop when you push
  require_verification      TINYINT(1) NOT NULL DEFAULT 1,           -- if 0, patients get a token with no email/OTP at all
  updated_at                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_settings_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- QUEUE SESSIONS (one per vendor per operating day; counter resets daily)
-- ---------------------------------------------------------------------------
CREATE TABLE queue_sessions (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  vendor_id           INT UNSIGNED NOT NULL,
  session_date        DATE NOT NULL,
  status              ENUM('open','paused','closed') NOT NULL DEFAULT 'open',
  pause_reason        VARCHAR(255) NULL,
  current_token_number SMALLINT UNSIGNED NOT NULL DEFAULT 0,  -- "now serving" number
  next_token_number    SMALLINT UNSIGNED NOT NULL DEFAULT 1,  -- next number to be issued
  last_called_at       DATETIME NULL,
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_vendor_day (vendor_id, session_date),
  CONSTRAINT fk_session_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- TOKENS (the actual patient tokens)
-- ---------------------------------------------------------------------------
CREATE TABLE tokens (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id      INT UNSIGNED NOT NULL,
  vendor_id       INT UNSIGNED NOT NULL,
  token_number    SMALLINT UNSIGNED NOT NULL,
  queue_position  SMALLINT UNSIGNED NOT NULL,  -- serving order; separate from token_number so a
                                                -- push/skip can reorder without relabeling the token
  patient_email   VARCHAR(255) NOT NULL,
  patient_name    VARCHAR(150) NULL,
  status          ENUM('waiting','called','served','skipped','forfeited','expired','cancelled')
                    NOT NULL DEFAULT 'waiting',
  push_used       TINYINT(1) NOT NULL DEFAULT 0,
  skip_used       TINYINT(1) NOT NULL DEFAULT 0,   -- one no-show skip tolerance already consumed
  called_at       DATETIME NULL,
  served_at       DATETIME NULL,
  vendor_comment  VARCHAR(500) NULL,   -- comment vendor adds when calling this token
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at      DATETIME NOT NULL,
  KEY idx_session_status (session_id, status),
  KEY idx_vendor_created (vendor_id, created_at),
  CONSTRAINT fk_token_session FOREIGN KEY (session_id) REFERENCES queue_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_token_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- MAGIC LINKS (passwordless patient auth — stores hashed one-time OTP codes)
-- ---------------------------------------------------------------------------
CREATE TABLE magic_links (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email       VARCHAR(255) NOT NULL,
  token_hash  VARCHAR(255) NOT NULL,   -- HMAC hash of the 6-digit OTP code
  purpose     ENUM('patient_login') NOT NULL DEFAULT 'patient_login',
  expires_at  DATETIME NOT NULL,
  used_at     DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_email (email)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- PATIENTS (remembers a verified patient's name so we don't ask again)
-- ---------------------------------------------------------------------------
CREATE TABLE patients (
  email       VARCHAR(255) NOT NULL PRIMARY KEY,
  name        VARCHAR(150) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- CALL EVENTS (append-only log — drives analytics & live average wait time)
-- ---------------------------------------------------------------------------
CREATE TABLE call_events (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id  INT UNSIGNED NOT NULL,
  vendor_id   INT UNSIGNED NOT NULL,
  token_id    INT UNSIGNED NOT NULL,
  event_type  ENUM('called','pushed','skipped','served','forfeited','expired') NOT NULL,
  comment     VARCHAR(500) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_vendor_time (vendor_id, created_at),
  CONSTRAINT fk_event_session FOREIGN KEY (session_id) REFERENCES queue_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_token FOREIGN KEY (token_id) REFERENCES tokens(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS (in-app; e.g. "you moved up because token #12 pushed back")
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token_id    INT UNSIGNED NOT NULL,
  message     VARCHAR(300) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at     DATETIME NULL,
  CONSTRAINT fk_notif_token FOREIGN KEY (token_id) REFERENCES tokens(id) ON DELETE CASCADE
) ENGINE=InnoDB;
