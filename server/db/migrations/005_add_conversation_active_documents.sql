-- 005_add_conversation_active_documents.sql
-- Add active_documents column to conversations table for conversation-level document persistence

ALTER TABLE conversations ADD COLUMN active_documents TEXT;

-- Create index for faster lookups if needed
CREATE INDEX IF NOT EXISTS idx_conversations_active_documents ON conversations(active_documents);