-- Complete RLS Policy Fix for profiles table
-- This ensures service role can read, insert, update, and delete profiles
-- Run this in Supabase SQL Editor to fix webhook issues

-- First, drop ALL existing policies to start fresh
DROP POLICY IF EXISTS "Service role full access" ON profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Service role can update profiles" ON profiles;
DROP POLICY IF EXISTS "Service role can select profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

-- Create a comprehensive SELECT policy for service role
-- This is critical for webhooks to read profiles
CREATE POLICY "Service role can select profiles" ON profiles
  FOR SELECT
  USING (
    -- Service role can always select
    COALESCE(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role'
    OR auth.role() = 'service_role'
    OR auth.uid() IS NULL
    -- Regular users can view their own profile
    OR auth.uid() = id
  );

-- Create INSERT policy for service role
CREATE POLICY "Service role can insert profiles" ON profiles
  FOR INSERT
  WITH CHECK (
    COALESCE(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role'
    OR auth.role() = 'service_role'
    OR auth.uid() IS NULL
  );

-- Create UPDATE policy for service role
CREATE POLICY "Service role can update profiles" ON profiles
  FOR UPDATE
  USING (
    COALESCE(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role'
    OR auth.role() = 'service_role'
    OR auth.uid() IS NULL
    -- Regular users can update their own profile (if needed)
    OR auth.uid() = id
  )
  WITH CHECK (
    COALESCE(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role'
    OR auth.role() = 'service_role'
    OR auth.uid() IS NULL
    OR auth.uid() = id
  );

-- Create DELETE policy for service role (optional, for completeness)
CREATE POLICY "Service role can delete profiles" ON profiles
  FOR DELETE
  USING (
    COALESCE(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role'
    OR auth.role() = 'service_role'
    OR auth.uid() IS NULL
  );

-- Also create a comprehensive "full access" policy as backup
CREATE POLICY "Service role full access" ON profiles
  FOR ALL
  USING (
    COALESCE(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role'
    OR auth.role() = 'service_role'
    OR auth.uid() IS NULL
  )
  WITH CHECK (
    COALESCE(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role'
    OR auth.role() = 'service_role'
    OR auth.uid() IS NULL
  );

-- Verify policies were created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;
