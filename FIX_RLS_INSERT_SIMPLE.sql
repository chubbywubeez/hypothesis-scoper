-- Ultra-simple INSERT policy fix
-- This creates the most permissive policy possible for service role

-- Drop ALL existing policies first
DROP POLICY IF EXISTS "Service role INSERT" ON profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Service role full access" ON profiles;

-- Create the simplest possible INSERT policy
-- Service role key makes auth.uid() return NULL, so we check for that
CREATE POLICY "Service role INSERT" ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() IS NULL);

-- Verify it was created
SELECT policyname, cmd, with_check
FROM pg_policies
WHERE tablename = 'profiles' AND cmd = 'INSERT';
