-- 007_add_title_generation.sql
-- Adds a column to track whether a conversation title was auto-generated
-- so we can distinguish between auto-generated and manually renamed titles.

ALTER TABLE conversations ADD COLUMN title_generated INTEGER NOT NULL DEFAULT 0;