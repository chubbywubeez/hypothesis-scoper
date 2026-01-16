-- Test if UPDATE policy works
-- Run this to verify the service role can update profiles

-- First, check what auth context we have
SELECT 
  'Auth context check:' as test,
  auth.uid() as current_uid,
  auth.role() as current_role,
  current_setting('request.jwt.claims', true)::json->>'role' as jwt_role;

-- Try to update a test profile (replace with actual user ID)
-- This should work if the policy is correct
UPDATE profiles 
SET 
  subscription_status = 'active',
  subscription_updated_at = NOW()
WHERE id = 'a5db0bdd-28a5-4f57-86fb-5721ceb8a13e'
RETURNING id, email, subscription_status, subscription_updated_at;

-- If the above works, the policy is correct
-- If it fails, check the error message

-- Also verify the UPDATE policy exists and is correct
SELECT 
  policyname,
  cmd,
  qual as using_clause,
  with_check
FROM pg_policies
WHERE tablename = 'profiles' AND cmd = 'UPDATE';
