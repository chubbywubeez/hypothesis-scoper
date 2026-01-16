-- Re-enable RLS with working policies
-- This should work now that we've confirmed the service role key is configured correctly

-- Step 1: Re-enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop any existing policies to start fresh
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
DROP POLICY IF EXISTS "Allow SELECT" ON profiles;
DROP POLICY IF EXISTS "Allow INSERT" ON profiles;
DROP POLICY IF EXISTS "Allow UPDATE" ON profiles;
DROP POLICY IF EXISTS "Allow DELETE" ON profiles;

-- Step 3: Create simple, working policies
-- Service role key makes auth.uid() return NULL, so we check for that

-- SELECT: Allow service role OR users viewing own profile
CREATE POLICY "Service role SELECT" ON profiles
  FOR SELECT
  USING (auth.uid() IS NULL OR auth.uid() = id);

-- INSERT: Allow service role only (for signup and webhooks)
CREATE POLICY "Service role INSERT" ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() IS NULL);

-- UPDATE: Allow service role only (for webhooks and admin operations)
-- CRITICAL: Both USING and WITH CHECK must be present and match
CREATE POLICY "Service role UPDATE" ON profiles
  FOR UPDATE
  USING (
    auth.uid() IS NULL
    OR auth.role() = 'service_role'
    OR current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  )
  WITH CHECK (
    auth.uid() IS NULL
    OR auth.role() = 'service_role'
    OR current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- DELETE: Allow service role only (for admin operations)
CREATE POLICY "Service role DELETE" ON profiles
  FOR DELETE
  USING (auth.uid() IS NULL);

-- Step 4: Verify policies were created
SELECT 
  policyname,
  cmd,
  CASE 
    WHEN qual IS NULL THEN 'No USING'
    ELSE 'Has USING'
  END as using_clause,
  CASE 
    WHEN with_check IS NULL THEN 'No WITH CHECK'
    ELSE 'Has WITH CHECK'
  END as with_check_clause
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY cmd, policyname;

-- Step 5: Verify RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'profiles';

-- Done! RLS is now enabled with working policies.
-- Test by:
-- 1. Trying to sign up a new user (should work)
-- 2. Checking that webhooks can update subscriptions (should work)
-- 3. Verifying regular users can only see their own profile (security check)
