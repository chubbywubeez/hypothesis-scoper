-- COMPLETE RLS RESET AND FIX
-- This script completely resets all RLS policies and creates simple, working policies
-- Run this ENTIRE script in Supabase SQL Editor

-- ============================================
-- STEP 1: Drop ALL existing policies
-- ============================================
DROP POLICY IF EXISTS "Service role full access" ON profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Service role can update profiles" ON profiles;
DROP POLICY IF EXISTS "Service role can select profiles" ON profiles;
DROP POLICY IF EXISTS "Service role can delete profiles" ON profiles;
DROP POLICY IF EXISTS "Service role INSERT" ON profiles;
DROP POLICY IF EXISTS "Service role UPDATE" ON profiles;
DROP POLICY IF EXISTS "Service role DELETE" ON profiles;
DROP POLICY IF EXISTS "Service role SELECT" ON profiles;
DROP POLICY IF EXISTS "Users view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

-- ============================================
-- STEP 2: Verify all policies are dropped
-- ============================================
SELECT 'Policies before reset:' as status;
SELECT COUNT(*) as policy_count FROM pg_policies WHERE tablename = 'profiles';

-- ============================================
-- STEP 3: Create SIMPLE policies that definitely work
-- ============================================

-- SELECT: Allow service role (auth.uid() IS NULL) OR users viewing own profile
CREATE POLICY "Allow SELECT" ON profiles
  FOR SELECT
  USING (auth.uid() IS NULL OR auth.uid() = id);

-- INSERT: Allow service role only (auth.uid() IS NULL)
CREATE POLICY "Allow INSERT" ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() IS NULL);

-- UPDATE: Allow service role only (auth.uid() IS NULL)
CREATE POLICY "Allow UPDATE" ON profiles
  FOR UPDATE
  USING (auth.uid() IS NULL)
  WITH CHECK (auth.uid() IS NULL);

-- DELETE: Allow service role only (auth.uid() IS NULL)
CREATE POLICY "Allow DELETE" ON profiles
  FOR DELETE
  USING (auth.uid() IS NULL);

-- ============================================
-- STEP 4: Verify policies were created
-- ============================================
SELECT 'Policies after reset:' as status;
SELECT 
  policyname,
  cmd,
  CASE 
    WHEN qual IS NULL THEN 'No USING clause'
    ELSE 'Has USING clause'
  END as using_clause,
  CASE 
    WHEN with_check IS NULL THEN 'No WITH CHECK clause'
    ELSE 'Has WITH CHECK clause'
  END as with_check_clause
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY cmd, policyname;

-- ============================================
-- STEP 5: Test the policies work
-- ============================================
-- This should show NULL for all three (service role context)
SELECT 
  'Auth context test:' as test_name,
  auth.uid() as current_uid,
  auth.role() as current_role,
  current_setting('request.jwt.claims', true)::json->>'role' as jwt_role;

-- ============================================
-- DONE! The policies should now work.
-- ============================================
-- If INSERT still fails, the issue might be:
-- 1. Service role key not configured correctly in Railway
-- 2. Need to restart the server after policy changes
-- 3. Some other configuration issue
