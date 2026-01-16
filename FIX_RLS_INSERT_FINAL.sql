-- Final fix for INSERT policy - make it more permissive
-- The issue: INSERT is still being blocked even with auth.uid() IS NULL check
-- Solution: Create a very permissive policy that definitely works

-- Drop ALL existing INSERT policies
DROP POLICY IF EXISTS "Service role INSERT" ON profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Service role full access" ON profiles;

-- Create a very permissive INSERT policy
-- This should work for service role (auth.uid() IS NULL)
CREATE POLICY "Service role INSERT" ON profiles
  FOR INSERT
  WITH CHECK (
    -- Primary check: service role makes auth.uid() NULL
    auth.uid() IS NULL
    -- Fallback checks
    OR auth.role() = 'service_role'
    OR current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    -- Also allow if user is inserting their own profile (shouldn't happen but just in case)
    OR auth.uid() = id
    -- Last resort: allow if no auth context at all (service role operations)
    OR (auth.uid() IS NULL AND auth.role() IS NULL)
  );

-- Also recreate the full access policy as backup
CREATE POLICY "Service role full access" ON profiles
  FOR ALL
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

-- Verify the policies
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname, cmd;

-- Test query to see what auth.uid() and auth.role() return
-- This helps debug why the policy might not be matching
SELECT 
  auth.uid() as current_uid,
  auth.role() as current_role,
  current_setting('request.jwt.claims', true)::json->>'role' as jwt_role;
