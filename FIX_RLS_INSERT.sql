-- Fix INSERT policy to allow signup to work
-- The issue: INSERT policy might not be matching correctly during signup
-- Solution: Make INSERT policy more permissive for service role

-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "Service role INSERT" ON profiles;

-- Create a new INSERT policy that definitely works
-- This allows service role (auth.uid() IS NULL) OR users inserting their own profile
CREATE POLICY "Service role INSERT" ON profiles
  FOR INSERT
  WITH CHECK (
    -- Service role key makes auth.uid() NULL
    auth.uid() IS NULL
    -- Also check role
    OR auth.role() = 'service_role'
    -- Also check JWT claims
    OR current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    -- Allow users to insert their own profile (for signup)
    OR auth.uid() = id
  );

-- Verify the policy was created
SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'profiles' AND cmd = 'INSERT'
ORDER BY policyname;
