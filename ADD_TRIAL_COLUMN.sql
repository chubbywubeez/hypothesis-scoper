-- Add trial_started_at column to profiles table for 3-day free trial
-- Run this in Supabase SQL Editor

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP WITH TIME ZONE;

-- Create index for trial queries
CREATE INDEX IF NOT EXISTS profiles_trial_started_at_idx ON profiles(trial_started_at);

-- Set trial_started_at for existing users who don't have a subscription
-- This gives existing users a 3-day trial from now
UPDATE profiles 
SET trial_started_at = NOW()
WHERE trial_started_at IS NULL 
  AND (subscription_status IS NULL OR subscription_status = 'inactive');
