-- Add terms_accepted columns to profiles table
-- Run this in Supabase SQL Editor

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP WITH TIME ZONE;

-- Update existing users to have terms_accepted = true (if they exist)
UPDATE profiles 
SET terms_accepted = true, terms_accepted_at = created_at 
WHERE terms_accepted IS NULL OR terms_accepted = false;
