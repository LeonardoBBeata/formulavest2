-- Add last_active column to usuarios for tracking activity/streaks
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS last_active TIMESTAMP;
