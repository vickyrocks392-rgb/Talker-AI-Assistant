-- 002_documents_table.sql
-- Creates the documents table for RAG document tracking
-- Note: embedding_model column is added in a later migration

CREATE TABLE IF NOT EXISTS documents (
    id              TEXT PRIMARY KEY,
    filename        TEXT NOT NULL,
    original_name   TEXT NOT NULL,
    mime_type       TEXT NOT NULL DEFAULT 'application/pdf',
    size            INTEGER NOT NULL DEFAULT 0,
    page_count      INTEGER NOT NULL DEFAULT 0,
    text_length     INTEGER NOT NULL DEFAULT 0,
    chunk_count     INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'indexed',
    is_active       INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_created_at
    ON documents (created_at);

CREATE INDEX IF NOT EXISTS idx_documents_is_active
    ON documents (is_active);