-- 006_add_global_memory.sql
-- Creates the global_memory table for site-wide memory access.
-- Stores Q&A pairs that can be shared across all conversations for the same user.
-- This is separate from conversation-scoped memory.

CREATE TABLE IF NOT EXISTS global_memory (
    id         TEXT PRIMARY KEY,
    query      TEXT NOT NULL,
    answer     TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    access_count INTEGER DEFAULT 0,
    tags       TEXT
);

CREATE INDEX IF NOT EXISTS idx_global_memory_query
    ON global_memory (query);

CREATE INDEX IF NOT EXISTS idx_global_memory_created_at
    ON global_memory (created_at);