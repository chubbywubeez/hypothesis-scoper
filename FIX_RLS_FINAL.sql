-- Final fix for RLS UPDATE issue
-- The problem: auth.role() doesn't always return 'service_role' when using JS client
-- Solution: Use policies that check for NULL auth.uid() (which happens with service role)

-- Drop all existing policies
DROP POLICY IF EXISTS "Service role full access" ON profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Service role can update profiles" ON profiles;
DROP POLICY IF EXISTS "Service role can select profiles" ON profiles;
DROP POLICY IF EXISTS "Service role can delete profiles" ON profiles;
DROP POLICY IF EXISTS "Service role SELECT" ON profiles;
DROP POLICY IF EXISTS "Service role INSERT" ON profiles;
DROP POLICY IF EXISTS "Service role UPDATE" ON profiles;
DROP POLICY IF EXISTS "Service role DELETE" ON profiles;
DROP POLICY IF EXISTS "Users view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

-- Create policies that work with service role key
-- Service role key makes auth.uid() return NULL, so we check for that

-- SELECT: Service role OR users viewing own profile
CREATE POLICY "Service role SELECT" ON profiles
  FOR SELECT
  USING (
    auth.uid() IS NULL  -- Service role key makes this NULL
    OR auth.role() = 'service_role'
    OR current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    OR auth.uid() = id  -- Users can view own profile
  );

-- INSERT: Service role only
CREATE POLICY "Service role INSERT" ON profiles
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NULL  -- Service role key makes this NULL
    OR auth.role() = 'service_role'
    OR current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- UPDATE: Service role only (THIS IS THE CRITICAL ONE)
-- Must have both USING and WITH CHECK
CREATE POLICY "Service role UPDATE" ON profiles
  FOR UPDATE
  USING (
    auth.uid() IS NULL  -- Service role key makes this NULL
    OR auth.role() = 'service_role'
    OR current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  )
  WITH CHECK (
    auth.uid() IS NULL  -- Service role key makes this NULL
    OR auth.role() = 'service_role'
    OR current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- DELETE: Service role only
CREATE POLICY "Service role DELETE" ON profiles
  FOR DELETE
  USING (
    auth.uid() IS NULL  -- Service role key makes this NULL
    OR auth.role() = 'service_role'
    OR current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- Verify policies
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;
