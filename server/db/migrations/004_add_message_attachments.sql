-- 004_add_message_attachments.sql
-- Add attachments column to messages table for attachment persistence

ALTER TABLE messages ADD COLUMN attachments TEXT;

-- Create index for faster lookups if needed
CREATE INDEX IF NOT EXISTS idx_messages_attachments ON messages(attachments);
