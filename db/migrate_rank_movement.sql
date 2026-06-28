-- Add previous_rank column to users table for rank movement indicators
ALTER TABLE users ADD COLUMN previous_rank INTEGER NOT NULL DEFAULT 0;
