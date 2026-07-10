-- 003_add_embedding_model.sql
-- Adds the embedding_model column to the documents table
-- This migration is safe to run on existing databases that
-- were created before this column existed.

ALTER TABLE documents
ADD COLUMN embedding_model TEXT NOT NULL DEFAULT 'nomic-embed-text';