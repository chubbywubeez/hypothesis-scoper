-- Setup Admin Tracking Tables
-- This script creates the tables needed for admin dashboard analytics
-- and sets up RLS policies that allow service role access

-- Create login_events table to track user logins
CREATE TABLE IF NOT EXISTS login_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  login_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);

-- Create generation_events table to track AI generations
CREATE TABLE IF NOT EXISTS generation_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  generation_type TEXT NOT NULL CHECK (generation_type IN ('hypothesis', 'scope', 'quick_scope', 'advanced_conversation', 'advanced_hypothesis')),
  tokens_used INTEGER,
  input_length INTEGER,
  output_length INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE login_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Service role full access login_events" ON login_events;
DROP POLICY IF EXISTS "Service role full access generation_events" ON generation_events;
DROP POLICY IF EXISTS "Users can view own login events" ON login_events;
DROP POLICY IF EXISTS "Users can view own generation events" ON generation_events;

-- Policy: Service role can do anything (for backend operations)
-- Using auth.uid() IS NULL to detect service role, similar to profiles table
CREATE POLICY "Service role full access login_events" ON login_events
  FOR ALL USING (
    auth.uid() IS NULL 
    OR auth.role() = 'service_role' 
    OR current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

CREATE POLICY "Service role full access generation_events" ON generation_events
  FOR ALL USING (
    auth.uid() IS NULL 
    OR auth.role() = 'service_role' 
    OR current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- Policy: Users can view their own events (optional, for transparency)
CREATE POLICY "Users can view own login events" ON login_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own generation events" ON generation_events
  FOR SELECT USING (auth.uid() = user_id);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS login_events_user_id_idx ON login_events(user_id);
CREATE INDEX IF NOT EXISTS login_events_login_at_idx ON login_events(login_at);
CREATE INDEX IF NOT EXISTS generation_events_user_id_idx ON generation_events(user_id);
CREATE INDEX IF NOT EXISTS generation_events_created_at_idx ON generation_events(created_at);
CREATE INDEX IF NOT EXISTS generation_events_type_idx ON generation_events(generation_type);
