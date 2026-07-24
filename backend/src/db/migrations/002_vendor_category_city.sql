-- Run this ONLY if you already executed schema.sql once before (i.e. `vendors`
-- table already exists without `category`/`city`). If you haven't deployed yet,
-- ignore this file — schema.sql already includes these columns.
USE u281498814_queueit;

ALTER TABLE vendors
  ADD COLUMN category VARCHAR(60) NOT NULL DEFAULT 'Other' AFTER slug,
  ADD COLUMN city VARCHAR(100) NULL AFTER category,
  ADD KEY idx_category (category),
  ADD KEY idx_city (city);
