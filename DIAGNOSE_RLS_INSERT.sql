-- Diagnostic script to check RLS and policies
-- Run this to see what's blocking the INSERT

-- 1. Check if RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'profiles';

-- 2. List ALL policies on profiles table
SELECT 
  policyname,
  cmd,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY cmd, policyname;

-- 3. Check what auth context returns (should be NULL for service role)
SELECT 
  auth.uid() as current_uid,
  auth.role() as current_role,
  current_setting('request.jwt.claims', true)::json->>'role' as jwt_role;

-- 4. Try a test insert to see the exact error
-- (This will fail but show us the exact policy that's blocking)
-- Uncomment to test:
-- INSERT INTO profiles (id, email, role, terms_accepted, terms_accepted_at)
-- VALUES (
--   gen_random_uuid(),
--   'test@example.com',
--   'customer',
--   true,
--   NOW()
-- );
