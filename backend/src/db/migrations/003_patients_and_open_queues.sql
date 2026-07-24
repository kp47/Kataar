-- Run this ONLY if you already executed schema.sql once before. If you
-- haven't deployed yet, ignore this file — schema.sql already includes these.
USE u281498814_queueit;

CREATE TABLE IF NOT EXISTS patients (
  email       VARCHAR(255) NOT NULL PRIMARY KEY,
  name        VARCHAR(150) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

ALTER TABLE vendor_settings
  ADD COLUMN require_verification TINYINT(1) NOT NULL DEFAULT 1 AFTER push_bump_positions;
