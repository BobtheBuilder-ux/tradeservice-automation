-- Fix email_queue table column names to match schema
-- Migration: 0004_fix_email_queue_columns
-- Purpose: Rename columns from snake_case to camelCase to match Drizzle schema

-- Rename columns to match schema.js camelCase naming
ALTER TABLE email_queue RENAME COLUMN recipient_email TO to_email;
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS from_email VARCHAR(255) NOT NULL DEFAULT 'noreply@yourdomain.com';
ALTER TABLE email_queue RENAME COLUMN body TO html_content;
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS text_content TEXT;
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS email_type VARCHAR(100) NOT NULL DEFAULT 'general';
ALTER TABLE email_queue RENAME COLUMN scheduled_for TO scheduled_for;
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS message_id VARCHAR(255);
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id);
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS tracking_id VARCHAR(255);
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE email_queue ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal';

-- Update indexes to match new column names
DROP INDEX IF EXISTS idx_email_queue_recipient;
CREATE INDEX IF NOT EXISTS idx_email_queue_to_email ON email_queue(to_email);
CREATE INDEX IF NOT EXISTS idx_email_queue_lead_id ON email_queue(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_email_type ON email_queue(email_type);
CREATE INDEX IF NOT EXISTS idx_email_queue_tracking_id ON email_queue(tracking_id);

-- Add constraints
ALTER TABLE email_queue ADD CONSTRAINT valid_email_priority CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
ALTER TABLE email_queue ADD CONSTRAINT valid_email_type CHECK (email_type IN ('welcome', 'appointment_scheduling', 'follow_up', 'meeting_reminder_24h', 'meeting_reminder_1h', 'scheduling', 'general'));